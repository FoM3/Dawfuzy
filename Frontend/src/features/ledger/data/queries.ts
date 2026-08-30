import { useQuery } from "@tanstack/react-query";
import { callRpc, explainApiError, fetchPage } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { AuditEntry, Transaction } from "@/features/ledger/types";

export const PAGE_SIZE = 20;

// Range bounds are inclusive; empty strings mean unbounded. PostgREST wants them absent
// rather than empty, and the aggregates take null.
const bounds = (from: string, to: string) => ({ from_date: from || null, to_date: to || null });

// Two bounds on one column cannot be two query keys, so they go through PostgREST's
// and= form. One bound is a plain filter.
const rangeParams = (from: string, to: string): Record<string, string> => {
  if (from && to) return { and: `(sold_on.gte.${from},sold_on.lte.${to})` };
  if (from) return { sold_on: `gte.${from}` };
  if (to) return { sold_on: `lte.${to}` };
  return {};
};

type RemoteSale = {
  id: string; product_id: string | null; item: string; quantity: number;
  unit_price: number; cost_price?: number; amount: number; sold_on: string;
  sold_at_label: string; recorded_by?: string | null; recorded_by_name?: string; note?: string;
};

const toTransaction = (r: RemoteSale): Transaction => ({
  id: r.id,
  type: "sale",
  productId: r.product_id ?? undefined,
  item: r.item,
  quantity: Number(r.quantity),
  unitPrice: Number(r.unit_price),
  // Users are served the cost-free view; 0 makes profit read as 0 rather than NaN.
  costPrice: Number(r.cost_price ?? 0),
  amount: Number(r.amount),
  date: r.sold_on,
  time: r.sold_at_label,
  recordedById: r.recorded_by ?? undefined,
  recordedBy: r.recorded_by_name || undefined,
  note: r.note || undefined
});

// One page of sales for a date range, newest first.
// Ordered by the day, then the time it was rung up. created_at is the tie-break only:
// back-entered sales all share one arrival time, so on its own it scrambles their order.
const SALES_ORDER = "sold_on.desc,sold_at.desc.nullslast,created_at.desc";
const LEGACY_ORDER = "sold_on.desc,created_at.desc";

export function useSalesPage(from: string, to: string, page: number, isAdmin: boolean, person = "") {
  return useQuery({
    queryKey: ["sales", "page", { from, to, page, isAdmin, person }],
    enabled: isSupabaseConfigured,
    // Keeps the previous page on screen while the next loads, instead of flashing empty.
    placeholderData: previous => previous,
    queryFn: async () => {
      const params = {
        select: "*",
        ...rangeParams(from, to),
        ...(person ? { recorded_by_name: `eq.${person}` } : {})
      };
      const table = isAdmin ? "/sales" : "/sales_public";
      // sold_at arrives with a schema change. Until it has been run the column is unknown
      // and PostgREST rejects the order outright, so fall back rather than blank the screen.
      const result = await fetchPage<RemoteSale>(table, { ...params, order: SALES_ORDER }, page, PAGE_SIZE)
        .catch(() => fetchPage<RemoteSale>(table, { ...params, order: LEGACY_ORDER }, page, PAGE_SIZE));
      return { rows: result.rows.map(toTransaction), total: result.total };
    }
  });
}

// Every sale in a range, for the PDF export. The screen only ever holds one page, and a report of
// page 1 would be a quietly wrong document, so this walks the whole range. Chunked because
// PostgREST caps a single response.
export async function fetchAllSales(
  from: string,
  to: string,
  isAdmin: boolean,
  filters: { person?: string; productId?: string } = {}
): Promise<Transaction[]> {
  const table = isAdmin ? "/sales" : "/sales_public";
  const params: Record<string, string> = {
    select: "*",
    ...rangeParams(from, to),
    ...(filters.person ? { recorded_by_name: `eq.${filters.person}` } : {}),
    ...(filters.productId ? { product_id: `eq.${filters.productId}` } : {})
  };
  const chunk = 1000;
  const rows: Transaction[] = [];
  // Same fallback as the paged query: sold_at only exists once the schema change is run.
  let order = SALES_ORDER;

  for (let page = 0; ; page++) {
    const result = await fetchPage<RemoteSale>(table, { ...params, order }, page, chunk)
      .catch(() => fetchPage<RemoteSale>(table, { ...params, order: (order = LEGACY_ORDER) }, page, chunk));
    rows.push(...result.rows.map(toTransaction));
    if (rows.length >= result.total || result.rows.length === 0) return rows;
  }
}

type Totals = { revenue: number; profit: number; units: number; sale_count: number };

// Totals across the whole range, not the loaded page.
// person selects the three-argument overload; PostgREST resolves by argument name, so the
// unfiltered call still reaches the original two-argument function.
export function useSalesTotals(from: string, to: string, person = "") {
  return useQuery({
    queryKey: ["sales", "totals", { from, to, person }],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      // Same reason as the ordering above: the person-filtered overload arrives with a
      // schema change, and until it is run the unfiltered totals are the honest answer.
      const rows = person
        ? await callRpc<Totals[]>("sales_totals", { ...bounds(from, to), person })
            .catch(() => callRpc<Totals[]>("sales_totals", bounds(from, to)))
        : await callRpc<Totals[]>("sales_totals", bounds(from, to));
      const t = rows[0];
      return {
        revenue: Number(t?.revenue ?? 0),
        profit: Number(t?.profit ?? 0),
        units: Number(t?.units ?? 0),
        count: Number(t?.sale_count ?? 0)
      };
    }
  });
}

export function useSalesByDay(from: string, to: string) {
  return useQuery({
    queryKey: ["sales", "by-day", { from, to }],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const rows = await callRpc<{ sold_on: string; revenue: number }[]>("sales_by_day", bounds(from, to));
      return new Map(rows.map(r => [r.sold_on, Number(r.revenue)]));
    }
  });
}

export function useSalesByProduct(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["sales", "by-product", { from, to }],
    // The aggregates refuse anonymous callers, so do not ask before there is a session.
    enabled: enabled && isSupabaseConfigured,
    queryFn: async () => {
      const rows = await callRpc<{ item: string; units: number; revenue: number; profit: number }[]>(
        "sales_by_product",
        bounds(from, to)
      );
      return rows.map(r => ({
        name: r.item,
        units: Number(r.units),
        revenue: Number(r.revenue),
        profit: Number(r.profit)
      }));
    }
  });
}

export function useSalesByPerson(from: string, to: string) {
  return useQuery({
    queryKey: ["sales", "by-person", { from, to }],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const rows = await callRpc<{ name: string; sale_count: number; revenue: number }[]>(
        "sales_by_person",
        bounds(from, to)
      );
      return rows.map(r => ({ name: r.name, count: Number(r.sale_count), revenue: Number(r.revenue) }));
    }
  });
}

// First and last sale ever recorded, so an all-time daily average divides by real days.
export function useSalesSpan() {
  return useQuery({
    queryKey: ["sales", "span"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const rows = await callRpc<{ first_sale: string | null; last_sale: string | null }[]>("sales_span", {});
      return { first: rows[0]?.first_sale ?? null, last: rows[0]?.last_sale ?? null };
    }
  });
}

type RemoteAudit = {
  id: string; action: string; actor_id: string | null; actor_name: string;
  subject: string; detail: string | null; happened_on: string; happened_at_label: string;
};

// Corrects a recorded sale. The server decides who may touch which row, so the UI only has to
// offer the button; it cannot grant itself permission by hiding the rule.
export async function updateSale(
  id: string,
  quantity: number,
  productId: string,
  note: string
): Promise<string | null> {
  try {
    await callRpc("update_sale", {
      sale_id: id,
      new_quantity: quantity,
      new_product_id: productId,
      new_note: note
    });
    return null;
  } catch (error) {
    return explainApiError(error);
  }
}

export async function deleteSale(id: string): Promise<string | null> {
  try {
    await callRpc("delete_sale", { sale_id: id });
    return null;
  } catch (error) {
    return explainApiError(error);
  }
}

export type AuditFilters = { from: string; to: string; action: string; actor: string };

// The trail is filtered server-side, not on the page: filtering the twenty rows already
// loaded would search one page and look empty for anything older.
export function useAuditPage(page: number, enabled: boolean, filters: AuditFilters) {
  const { from, to, action, actor } = filters;
  return useQuery({
    queryKey: ["audit", "page", { page, from, to, action, actor }],
    enabled: enabled && isSupabaseConfigured,
    placeholderData: previous => previous,
    queryFn: async () => {
      const dates: Record<string, string> =
        from && to ? { and: `(happened_on.gte.${from},happened_on.lte.${to})` }
        : from ? { happened_on: `gte.${from}` }
        : to ? { happened_on: `lte.${to}` }
        : {};
      const result = await fetchPage<RemoteAudit>(
        "/audit_log",
        {
          select: "*",
          order: "created_at.desc",
          ...dates,
          ...(action ? { action: `eq.${action}` } : {}),
          ...(actor ? { actor_name: `eq.${actor}` } : {})
        },
        page,
        PAGE_SIZE
      );
      const rows: AuditEntry[] = result.rows.map(r => ({
        id: r.id,
        action: r.action as AuditEntry["action"],
        actorId: r.actor_id ?? "unknown",
        actorName: r.actor_name,
        subject: r.subject,
        detail: r.detail ?? "",
        date: r.happened_on,
        time: r.happened_at_label
      }));
      return { rows, total: result.total };
    }
  });
}

