export const money = (value: number) =>
  `GH₵ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const clockTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Local calendar day, not UTC, so the ledger rolls over at the shop's midnight.
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Number() turns "" into 0 and "-" into NaN; both must land on 0 so totals never read NaN.
export const toNumber = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);
