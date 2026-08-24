import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, AuditEntry, Product, Transaction } from "@/features/ledger/types";

export type SyncState = "local" | "synced" | "pending" | "offline" | "error";

// ------------------------------------------------------------------ outbox ----
// Ids of sales saved on this device that the server has not acknowledged yet. Held in
// memory only, so it lasts as long as the tab: nothing about this app is written to
// disk. A sale queued while offline is lost if the tab is closed before it drains.
let outbox: string[] = [];

export const readOutbox = (): string[] => outbox;

export const writeOutbox = (ids: string[]) => { outbox = [...new Set(ids)]; };
export const enqueue = (id: string) => writeOutbox([...readOutbox(), id]);
export const dequeue = (ids: string[]) => writeOutbox(readOutbox().filter(id => !ids.includes(id)));

// ------------------------------------------------------------------ mapping ---
const toRemoteSale = (t: Transaction, recordedBy: string | null) => ({
  id: t.id,
  product_id: t.productId ?? null,
  item: t.item,
  quantity: t.quantity,
  unit_price: t.unitPrice,
  cost_price: t.costPrice,
  amount: t.amount,
  sold_on: t.date,
  sold_at_label: t.time,
  recorded_by: recordedBy,
  recorded_by_name: t.recordedBy ?? ""
});

type RemoteSale = {
  id: string; product_id: string | null; item: string; quantity: number;
  unit_price: number; cost_price?: number; amount: number; sold_on: string; sold_at_label: string;
  recorded_by?: string | null; recorded_by_name?: string;
};

const fromRemoteSale = (r: RemoteSale): Transaction => ({
  id: r.id,
  type: "sale",
  productId: r.product_id ?? undefined,
  item: r.item,
  quantity: Number(r.quantity),
  unitPrice: Number(r.unit_price),
  // Users are served a cost-free view; 0 makes their profit read as 0 rather than NaN.
  costPrice: Number(r.cost_price ?? 0),
  amount: Number(r.amount),
  date: r.sold_on,
  time: r.sold_at_label,
  recordedById: r.recorded_by ?? undefined,
  recordedBy: r.recorded_by_name || undefined
});

type RemoteProduct = {
  id: string; name: string; description: string; pack: string;
  price: number; cost_price?: number;
};

const fromRemoteProduct = (r: RemoteProduct): Product => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  pack: r.pack as Product["pack"],
  costPrice: Number(r.cost_price ?? 0),
  price: Number(r.price),
  stock: 0,
  reorderAt: 10
});

export const toRemoteProduct = (p: Product) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  pack: p.pack,
  cost_price: p.costPrice,
  price: p.price,
  updated_at: new Date().toISOString()
});

// ------------------------------------------------------------------- pull -----
// Sales and the audit trail are paged by their screens (see data/queries.ts); only the
// small whole-of-shop lists are pulled in one go.
export async function pullProducts(client: SupabaseClient, isAdmin: boolean): Promise<Product[]> {
  const table = isAdmin ? "products" : "products_public";
  const { data, error } = await client.from(table).select("*");
  if (error) throw error;
  return (data ?? []).map(fromRemoteProduct);
}

/**
 * Admins read the profiles table so the Team screen can show PINs; everyone else
 * reads the people view, which has no pin column at all.
 */
export async function pullPeople(client: SupabaseClient, isAdmin = false): Promise<Account[]> {
  const { data, error } = await client.from(isAdmin ? "profiles" : "people").select("*");
  if (error) throw error;
  return (data ?? []).map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    pin: p.pin || undefined,
    email: p.email || undefined,
    disabledAt: p.disabled_at ?? null,
    // created_at is a full timestamptz; the UI works in plain calendar days.
    createdAt: (p.created_at ?? "").slice(0, 10)
  }));
}

// ------------------------------------------------------------------- push -----
/**
 * Sends every queued sale in one upsert. Safe to call repeatedly.
 *
 * recorded_by must equal auth.uid() or the RLS insert policy rejects the row, so the id
 * comes from the live Supabase session rather than local state. With no session the
 * queue is deliberately left intact, to be sent once somebody signs in.
 */
export async function flushOutbox(client: SupabaseClient, all: Transaction[], _userId?: string | null) {
  const queued = readOutbox();
  if (queued.length === 0) return { sent: 0 };

  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id ?? null;
  if (!userId) return { sent: 0, waiting: queued.length };

  const payload = all.filter(t => queued.includes(t.id) && t.type === "sale").map(t => toRemoteSale(t, userId));
  if (payload.length === 0) {
    dequeue(queued); // queued ids with no matching sale would never drain
    return { sent: 0 };
  }

  const { error } = await client.from("sales").upsert(payload, { onConflict: "id", ignoreDuplicates: false });
  if (error) throw error;

  dequeue(payload.map(p => p.id));
  return { sent: payload.length };
}

export async function pushProduct(client: SupabaseClient, product: Product) {
  const { error } = await client.from("products").upsert(toRemoteProduct(product), { onConflict: "id" });
  if (error) throw error;
}

// ------------------------------------------------------------------- audit ----
type RemoteAudit = {
  id: string; action: string; actor_id: string; actor_name: string;
  subject: string; detail: string; happened_on: string; happened_at_label: string;
};

export async function pushAudit(client: SupabaseClient, entry: AuditEntry) {
  // actor_id must match auth.uid() for the same reason as recorded_by on sales.
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const { error } = await client.from("audit_log").insert({
    id: entry.id,
    action: entry.action,
    actor_id: auth.user.id,
    actor_name: entry.actorName,
    subject: entry.subject,
    detail: entry.detail,
    happened_on: entry.date,
    happened_at_label: entry.time
  });
  if (error) throw error;
}

