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

// Accepts "5.6037, -0.1870" or a pasted Google Maps link, and returns "lat,lng".
// Null when there is nothing usable in it, so a stored pin always makes a working link.
export function parseCoords(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // A Maps URL carries the pin after an @, and the searched point after q= or query=.
  const fromUrl = /[@?&](?:q=|query=)?(-?\d{1,3}\.\d+)[,%2C\s]+(-?\d{1,3}\.\d+)/i.exec(trimmed);
  const plain = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(trimmed);
  const found = plain ?? fromUrl;
  if (!found) return null;
  const lat = Number(found[1]);
  const lng = Number(found[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${lat},${lng}`;
}

export const mapsLink = (coords: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;

// A phone number is anything carrying 9 to 15 digits. Spaces, dashes, brackets and a
// leading + are allowed because that is how people actually write them down; letters are
// not. Empty passes, since every number on a supplier is optional.
export function validPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/[^\d\s+()-]/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}
