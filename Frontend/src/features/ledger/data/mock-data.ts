import { today } from "@/lib/format";
import type { Account, Product, Transaction } from "@/features/ledger/types";

export const seedProducts: Product[] = [
  // Everpure
  { id: "6329f001-97aa-4761-a93e-ad0abc8e0d24", name: "Everpure 0.6L", description: "", pack: "Pack", costPrice: 35, price: 35, stock: 0, reorderAt: 10 },
  { id: "28b512ef-e3d6-4c53-935e-5155239c553e", name: "Everpure 370ml", description: "", pack: "Pack", costPrice: 31, price: 31, stock: 0, reorderAt: 10 },
  { id: "f32eff4e-8f3e-4792-82ac-1b61f682d27f", name: "Everpure dispenser refill", description: "", pack: "Dispenser", costPrice: 22, price: 22, stock: 0, reorderAt: 5 },
  { id: "78857d64-0afe-4e1b-925d-68cf2202d2c2", name: "Everpure dispenser (new)", description: "", pack: "Dispenser", costPrice: 120, price: 120, stock: 0, reorderAt: 2 },

  // Perla
  { id: "45f11f4c-beb4-41ad-a7e9-543b7cef762e", name: "Perla 500ml", description: "", pack: "Pack", costPrice: 32, price: 32, stock: 0, reorderAt: 10 },
  { id: "aefe9e4d-39a0-4221-9f77-27a14640c399", name: "Perla 750ml", description: "", pack: "Pack", costPrice: 30, price: 30, stock: 0, reorderAt: 10 },
  { id: "c20431ae-d858-4135-b8bc-5d67d223590e", name: "Perla dispenser", description: "", pack: "Dispenser", costPrice: 30, price: 30, stock: 0, reorderAt: 5 },

  // Verna
  { id: "885582ec-1244-47bc-a4fc-5a254da6202b", name: "Verna 500ml", description: "", pack: "Pack", costPrice: 25, price: 25, stock: 0, reorderAt: 10 },
  { id: "dcbb8695-a81b-4d7d-95dc-22730e6cb183", name: "Verna 750ml", description: "", pack: "Pack", costPrice: 31, price: 31, stock: 0, reorderAt: 10 },
  { id: "dfe2ca24-ec84-4856-90fc-2e56ceaf62f5", name: "Verna 24 pieces", description: "", pack: "Pack", costPrice: 34, price: 34, stock: 0, reorderAt: 10 },
  { id: "a0953a07-f05b-499d-9141-1bc91fce2533", name: "Verna dispenser", description: "", pack: "Dispenser", costPrice: 30, price: 30, stock: 0, reorderAt: 5 },

  // Voltic
  { id: "70806707-461f-4ed5-b113-67e79e14010b", name: "Voltic 500ml", description: "", pack: "Pack", costPrice: 30, price: 30, stock: 0, reorderAt: 10 },
  { id: "3e05566d-fc7f-4e7b-981d-1c551c1915cf", name: "Voltic 750ml", description: "", pack: "Pack", costPrice: 30, price: 30, stock: 0, reorderAt: 10 },
  { id: "90717917-2cf3-4f8b-90ce-ab92cdd38ac6", name: "Voltic 1.5L", description: "", pack: "Pack", costPrice: 30, price: 30, stock: 0, reorderAt: 10 },
  { id: "a882bbf0-6726-473c-a8b0-5d485f717915", name: "Voltic dispenser", description: "", pack: "Dispenser", costPrice: 35, price: 35, stock: 0, reorderAt: 5 },

  // Others
  { id: "aa308fe8-b7a4-4a4e-bcec-1b579f18393e", name: "Slimfit 500ml", description: "", pack: "Pack", costPrice: 25, price: 25, stock: 0, reorderAt: 10 },
  { id: "06459da4-9015-468f-a50d-7dc23c726ed7", name: "Bel-Aqua 500ml", description: "", pack: "Pack", costPrice: 30, price: 30, stock: 0, reorderAt: 10 },
  { id: "eb245c84-0f0e-4674-9022-393d2445f514", name: "Bel-Aqua Active", description: "", pack: "Pack", costPrice: 42, price: 42, stock: 0, reorderAt: 10 },
  { id: "b9e17a83-7680-4fc9-b9e3-3499a810ba5e", name: "Bel-Aqua 750ml", description: "", pack: "Pack", costPrice: 35, price: 35, stock: 0, reorderAt: 10 }
];

const priceOf = (id: string) => seedProducts.find(p => p.id === id)!;


// No demo sales: the ledger starts empty so every figure on screen is real.
export const seedTransactions: Transaction[] = [];

export const packTypes = ["Pack", "Bag", "Dispenser"] as const;

// One admin exists so there is always a way in; everyone else is added from the Team screen.
// The shop owner signs in with this. Kept fixed so the till is never locked out.
export const OWNER_PIN = "1575";

export const seedAccounts: Account[] = [
  { id: "owner", name: "FoM", role: "superadmin", pin: OWNER_PIN, createdAt: today() }
];
