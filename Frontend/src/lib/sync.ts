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
export const dropPending = (ids: string[]) => writePending(readPending().filter(s => !ids.includes(s.id)));
export const countPending = () => readPending().length;

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
// Sends the signed-in person's unsent sales; device-generated ids make a retry idempotent.
// Only their own go: recorded_by must equal auth.uid(), so another's would be miscredited.
// waiting counts only the caller's own rows. Somebody else's queued sale cannot be sent
// under this session, so counting it would leave the badge stuck on "Syncing" for a
// person with nothing to send and no way to clear it.
export async function flushOutbox(client: SupabaseClient) {
  const idle = { sent: 0, sentIds: [] as string[], waiting: 0, blocked: 0 };
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

  const { error } = await client
    .from("sales")
    .upsert(mine.map(sale => toRemoteSale(sale, userId)), { onConflict: "id", ignoreDuplicates: false });
  if (error) throw error;

  // Only now, once the server has them.
  const sentIds = mine.map(sale => sale.id);
  dropPending(sentIds);
  return { sent: mine.length, sentIds, waiting: readPending().filter(isMine).length, blocked };
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

