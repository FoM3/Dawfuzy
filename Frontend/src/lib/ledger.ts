import type { Transaction } from "@/features/ledger/types";

/** Profit uses the prices captured on the sale, never the product's current prices. */
export const saleProfit = (t: Transaction) => (t.unitPrice - t.costPrice) * t.quantity;

export const totalOf = (transactions: Transaction[], pick: (t: Transaction) => number) =>
  transactions.reduce((sum, t) => sum + pick(t), 0);

export const isSale = (t: Transaction) => t.type === "sale";

// Inclusive on both ends; empty bounds mean unbounded.
export const withinRange = (date: string, from: string, to: string) => (!from || date >= from) && (!to || date <= to);

export function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Whole days from a to b, both plain YYYY-MM-DD. Negative when b is earlier. */
export function daysBetween(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime()) / 86_400_000);
}

export function startOfMonth(iso: string) {
  const [y, m] = iso.split("-");
  return `${y}-${m}-01`;
}

// Takes a plain YYYY-MM-DD. A dash beats "Invalid Date" when the value is missing,
// which it is for anyone read through the people view: it has no created_at column.
export function formatDay(iso: string) {
  const [y, m, d] = (iso ?? "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
