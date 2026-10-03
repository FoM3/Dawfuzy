import type { Transaction } from "@/features/ledger/types";

// Profit uses the prices captured on the sale, never the product's current prices.
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

// Whole days from a to b, both plain YYYY-MM-DD. Negative when b is earlier.
export function daysBetween(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime()) / 86_400_000);
}

const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Monday, because a shop's week is a working week rather than a calendar one.
export function startOfWeek(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return shiftDays(iso, -weekday);
}

// Day 0 of the following month is the last day of this one, leap years included.
export function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return stamp(new Date(y, m, 0));
}

export function shiftMonths(iso: string, months: number) {
  const [y, m] = iso.split("-").map(Number);
  return stamp(new Date(y, m - 1 + months, 1));
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

// Sale times are whatever the recording device's locale produced, so one ledger holds both
// "16:29" and "4:29 PM". Returns minutes since midnight, or null when there is no time to read.
export function minutesOfDay(time: string) {
  const match = /^\s*(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([ap])\.?\s*m?\.?\s*$|^\s*(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*$/i.exec(time ?? "");
  if (!match) return null;
  const half = match[3]?.toLowerCase();
  let hour = Number(match[1] ?? match[4]);
  const minute = Number(match[2] ?? match[5]);
  if (minute > 59) return null;
  if (half === "a" && hour === 12) hour = 0;
  if (half === "p" && hour !== 12) hour += 12;
  return hour > 23 ? null : hour * 60 + minute;
}

// How a time-distribution report slices the range. The first two fold every day together to
// show the shop's rhythm; the last three walk the calendar to show the trend.
export type Grouping = "hourOfDay" | "weekday" | "day" | "week" | "month";

// label reads in the table, tick is the short form under the chart.
export type Bucket = { label: string; tick: string; rows: Transaction[] };

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function bucketSales(rows: Transaction[], grouping: Grouping, from: string, to: string): Bucket[] {
  if (grouping === "hourOfDay") {
    const slots: Bucket[] = Array.from({ length: 24 }, (_, h) => ({
      label: `${pad(h)}:00 to ${pad(h)}:59`, tick: pad(h), rows: []
    }));
    // A sale whose time cannot be read still belongs in the totals, so it gets its own row
    // rather than being dropped into an hour it may not have happened in.
    const unreadable: Bucket = { label: "Time not recorded", tick: "?", rows: [] };
    for (const row of rows) {
      const minutes = minutesOfDay(row.time);
      (minutes === null ? unreadable : slots[Math.floor(minutes / 60)]).rows.push(row);
    }
    return unreadable.rows.length ? [...slots, unreadable] : slots;
  }

  if (grouping === "weekday") {
    const slots: Bucket[] = weekdays.map(name => ({ label: name, tick: name.slice(0, 3), rows: [] }));
    for (const row of rows) {
      const [y, m, d] = row.date.split("-").map(Number);
      if (!y || !m || !d) continue;
      slots[(new Date(y, m - 1, d).getDay() + 6) % 7].rows.push(row);
    }
    return slots;
  }

  // The calendar groupings span the whole range so a quiet stretch shows as a gap. With no
  // bounds, which is what "All time" gives, the rows themselves set the ends.
  const dates = rows.map(row => row.date).filter(Boolean).sort();
  const start = from || dates[0] || "";
  const end = to || dates[dates.length - 1] || "";
  if (!start || !end || start > end) return [];

  const slots = new Map<string, Bucket>();
  const keyOf = (date: string) =>
    grouping === "day" ? date : grouping === "week" ? startOfWeek(date) : date.slice(0, 7);
  const labelOf = (key: string) => {
    if (grouping === "day") return formatDay(key);
    if (grouping === "week") return `Week of ${formatDay(key)}`;
    const [y, m] = key.split("-").map(Number);
    return `${months[m - 1]} ${y}`;
  };
  const tickOf = (key: string) => {
    if (grouping === "day") return String(Number(key.slice(8, 10)));
    if (grouping === "week") return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
    return months[Number(key.slice(5, 7)) - 1];
  };

  const step = (date: string) =>
    grouping === "day" ? shiftDays(date, 1) : grouping === "week" ? shiftDays(date, 7) : shiftMonths(date, 1);
  let cursor = grouping === "day" ? start : grouping === "week" ? startOfWeek(start) : startOfMonth(start);
  while (cursor <= end) {
    const key = keyOf(cursor);
    slots.set(key, { label: labelOf(key), tick: tickOf(key), rows: [] });
    cursor = step(cursor);
  }

  for (const row of rows) {
    const key = keyOf(row.date);
    // A row can fall outside the bounds when the range is open on one end.
    const slot = slots.get(key) ?? { label: labelOf(key), tick: tickOf(key), rows: [] };
    slot.rows.push(row);
    slots.set(key, slot);
  }
  return [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, slot]) => slot);
}
