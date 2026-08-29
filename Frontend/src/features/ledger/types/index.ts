export type PackType = "Pack" | "Bag" | "Dispenser";

export type Product = {
  id: string;
  name: string;
  description: string;
  pack: PackType;
  costPrice: number;
  price: number;
  // Set when the product is withdrawn from sale. It stays in the catalogue and on every
  // past sale; it just stops being offered.
  retiredAt?: string | null;
  // Parked with the stock feature; kept so InventoryScreen still compiles.
  stock: number;
  // Parked with the stock feature; kept so InventoryScreen still compiles.
  reorderAt: number;
};

export type TransactionKind = "sale" | "restock";

export type Transaction = {
  id: string;
  type: TransactionKind;
  item: string;
  productId?: string;
  quantity: number;
  // Unit price at the moment of sale, so editing the product later cannot rewrite history.
  unitPrice: number;
  // Unit cost at the moment of sale, for the same reason.
  costPrice: number;
  amount: number;
  date: string;
  time: string;
  // Anything worth remembering about this sale. Optional and free-form.
  note?: string;
  // Who rang it up. Copied in, so removing the person keeps the attribution.
  recordedById?: string;
  recordedBy?: string;
};

export type LedgerScreen = "overview" | "entry" | "history" | "products" | "team" | "audit" | "account";

export type Role = "superadmin" | "admin" | "user";

// Both admin tiers see the same screens; only the owner may reset other people's PINs.
export const isAdminRole = (role: Role) => role === "admin" || role === "superadmin";

export type Account = {
  id: string;
  name: string;
  role: Role;
  // Only ever populated for an admin, or for your own account.
  pin?: string;
  // The synthetic sign-in address. Fixed at creation, so renaming never locks anyone out.
  email?: string;
  // Set when the person is disabled; they keep their history but cannot sign in.
  disabledAt?: string | null;
  createdAt: string;
};

// Screens a plain user may reach. Admins get everything.
// Products is read-only for them: no cost, no profit, no editing.
export const userScreens: LedgerScreen[] = ["entry", "history", "products", "account"];

export type AuditAction =
  | "product.added"
  | "product.updated"
  | "product.retired"
  | "product.restored"
  | "person.added"
  | "person.updated"
  | "person.removed"
  | "person.disabled"
  | "person.enabled"
  | "sale.updated"
  | "sale.deleted";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  // Who did it, captured at the time so removing them later does not erase the trail.
  actorId: string;
  actorName: string;
  subject: string;
  // Human-readable summary of what changed, e.g. "Selling price GH₵ 28.00 → GH₵ 15.00".
  detail: string;
  date: string;
  time: string;
};

export type ProductDraft = {
  name: string;
  description: string;
  pack: PackType;
  costPrice: number;
  price: number;
};

export type DateRangePreset = "today" | "yesterday" | "week" | "month" | "all" | "custom";

export type EntryForm = {
  products: Product[];
  selected: Product;
  productId: string;
  selectProduct: (id: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  quantityValue: number;
  submit: (event: React.FormEvent) => void;
  // Units sold per product, all time; drives most-sold-first ordering in the picker.
  popularity: Record<string, number>;
  canSeeProfit: boolean;
};
