import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, AuditEntry, Product, Transaction } from "@/features/ledger/types";

export type SyncState = "local" | "synced" | "pending" | "offline" | "error";

// Outbox
// Sales the server has not acknowledged yet, and the only shop data written to disk. Held
// in memory they did not survive a reload, so an offline sale vanished silently.
export const PENDING_KEY = "dawfuzy-unsent-sales-v1";

export const readPending = (): Transaction[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
};

const writePending = (sales: Transaction[]) => {
  try {
    if (sales.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(sales));
  } catch {
    // Storage full or blocked. The sale is still in memory for this session.
  }
};

export const addPending = (sale: Transaction) => writePending([...readPending().filter(s => s.id !== sale.id), sale]);
export const dropPending = (ids: string[]) => {
  writePending(readPending().filter(s => !ids.includes(s.id)));
  dropFailures(ids);
};
export const countPending = () => readPending().length;

// Why a queued sale is not going up, kept beside the outbox rather than on the sale itself,
// so a row that eventually sends carries no trace of having struggled.
export const FAILURE_KEY = "dawfuzy-unsent-failures-v1";

// After this many rejections a sale is set aside rather than retried every 20 seconds
// forever. It is never discarded: it is takings that exist nowhere else.
const GIVE_UP_AFTER = 3;

export type SaleFailure = { attempts: number; reason: string };

export const readFailures = (): Record<string, SaleFailure> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAILURE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, SaleFailure>) : {};
  } catch {
    return {};
  }
};

const writeFailures = (failures: Record<string, SaleFailure>) => {
  try {
    if (Object.keys(failures).length === 0) localStorage.removeItem(FAILURE_KEY);
    else localStorage.setItem(FAILURE_KEY, JSON.stringify(failures));
  } catch {
    // Storage full or blocked. The sale itself is what matters, and that is already written.
  }
};

// A sale is set aside once it has been rejected enough times to look permanent.
export const isSetAside = (failure?: SaleFailure) => (failure?.attempts ?? 0) >= GIVE_UP_AFTER;

// Set-aside sale ids against why, for the badge and for the row in history.
export const setAsideReasons = (): Record<string, string> => {
  const failures = readFailures();
  const reasons: Record<string, string> = {};
  for (const sale of readPending()) {
    if (isSetAside(failures[sale.id])) reasons[sale.id] = failures[sale.id].reason;
  }
  return reasons;
};

// Tapping the badge means "I have fixed whatever it was": wipe the tally so every set-aside
// sale gets a fresh run of attempts.
export const clearFailures = () => writeFailures({});

// A sale that left the outbox, sent or deleted, has nothing left to explain.
function dropFailures(ids: string[]) {
  const failures = readFailures();
  if (!ids.some(id => id in failures)) return;
  for (const id of ids) delete failures[id];
  writeFailures(failures);
}

// A PostgrestError is a plain object, so String() on it gives "[object Object]" and the
// badge would report nothing useful. Read its own fields first.
export function syncFailureReason(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const text = e.message || e.details || e.hint;
    if (text) return e.code ? `${text} (${e.code})` : text;
  }
  return String(error);
}

// Mapping
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
  recorded_by_name: t.recordedBy ?? "",
  note: t.note ?? ""
});

type RemoteSale = {
  id: string; product_id: string | null; item: string; quantity: number;
  unit_price: number; cost_price?: number; amount: number; sold_on: string; sold_at_label: string;
  recorded_by?: string | null; recorded_by_name?: string; note?: string;
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
  recordedBy: r.recorded_by_name || undefined,
  note: r.note || undefined
});

type RemoteProduct = {
  id: string; name: string; description: string; pack: string;
  price: number; cost_price?: number; retired_at?: string | null;
};

const fromRemoteProduct = (r: RemoteProduct): Product => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  pack: r.pack as Product["pack"],
  costPrice: Number(r.cost_price ?? 0),
  price: Number(r.price),
  retiredAt: r.retired_at ?? null,
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
  retired_at: p.retiredAt ?? null,
  updated_at: new Date().toISOString()
});

// Pull
// Sales and the audit trail are paged by their screens (see data/queries.ts); only the
// small whole-of-shop lists are pulled in one go.
export async function pullProducts(client: SupabaseClient, isAdmin: boolean): Promise<Product[]> {
  const table = isAdmin ? "products" : "products_public";
  const { data, error } = await client.from(table).select("*");
  if (error) throw error;
  return (data ?? []).map(fromRemoteProduct);
}

// Admins read the profiles table so the Team screen can show PINs; everyone else reads the people
// view, which has no pin column at all.
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

// Push
// Plain inserts, never an upsert. PostgREST turns an upsert into INSERT ... ON CONFLICT DO
// UPDATE, and Postgres then checks the table's UPDATE policy; sales has none by design, so
// every queued sale was rejected with 42501 whether or not it had already landed.
const DUPLICATE_KEY = "23505";

// Sends the signed-in person's unsent sales; device-generated ids make a retry idempotent.
// Only their own go: recorded_by must equal auth.uid(), so another's would be miscredited.
// waiting counts only the caller's own rows. Somebody else's queued sale cannot be sent
// under this session, so counting it would leave the badge stuck on "Syncing" for a
// person with nothing to send and no way to clear it.
export async function flushOutbox(client: SupabaseClient) {
  const idle = { sent: 0, sentIds: [] as string[], waiting: 0, blocked: 0, setAside: 0 };
  const pending = readPending();
  if (pending.length === 0) return idle;

  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id ?? null;
  // No session yet: still count them, so a retry runs once one is restored.
  if (!userId) return { ...idle, waiting: pending.length };

  const isMine = (sale: Transaction) => (sale.recordedById ?? userId) === userId;
  const mine = pending.filter(isMine);
  const blocked = pending.length - mine.length;
  if (mine.length === 0) return { ...idle, blocked };

  const failures = readFailures();
  // Set-aside sales are held back so one that can never go does not keep every sale behind
  // it from going. They are still on the device, and the badge still names them.
  const sending = mine.filter(sale => !isSetAside(failures[sale.id]));
  const setAside = mine.length - sending.length;
  if (sending.length === 0) return { ...idle, blocked, setAside };

  const sentIds: string[] = [];
  const { error } = await client.from("sales").insert(sending.map(sale => toRemoteSale(sale, userId)));
  if (!error) {
    sentIds.push(...sending.map(sale => sale.id));
  } else {
    // A batch is one statement, so a single rejected row rolls the whole thing back. Send
    // them one at a time to find out which, and let the good ones through regardless.
    for (const sale of sending) {
      const { error: one } = await client.from("sales").insert(toRemoteSale(sale, userId));
      // Already on the server: the response to an earlier attempt was simply lost.
      if (!one || one.code === DUPLICATE_KEY) {
        sentIds.push(sale.id);
        delete failures[sale.id];
        continue;
      }
      failures[sale.id] = {
        attempts: (failures[sale.id]?.attempts ?? 0) + 1,
        reason: syncFailureReason(one)
      };
    }
  }

  // Only now, once the server has them.
  dropPending(sentIds);
  writeFailures(failures);
  const left = readPending().filter(isMine);
  return {
    sent: sentIds.length,
    sentIds,
    waiting: left.filter(sale => !isSetAside(failures[sale.id])).length,
    blocked,
    setAside: left.filter(sale => isSetAside(failures[sale.id])).length
  };
}

export async function pushProduct(client: SupabaseClient, product: Product) {
  const { error } = await client.from("products").upsert(toRemoteProduct(product), { onConflict: "id" });
  if (error) throw error;
}

// Audit
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

