// PARKED: the water-stock feature is intentionally not wired to a tab right now.
// Kept intact for a later release. Re-enable by adding a "Water stock" entry to
// LedgerNav's items list and rendering this screen from Ledger.tsx with a restock handler.
import { useMemo, useState } from "react";
import { Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { money, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/features/ledger/types";

export function InventoryScreen({ products, restock }: { products: Product[]; restock: (product: Product, amount: number) => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const total = useMemo(() => products.reduce((sum, p) => sum + p.stock, 0), [products]);

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-10 block justify-between gap-10 sm:flex sm:items-end">
        <div>
          <Eyebrow>Live stock</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(34px,4.5vw,62px)] leading-none font-medium tracking-[-2px]">
            {total} packs & bags
            <br />
            <em className="font-medium text-accent">ready to sell.</em>
          </h2>
        </div>
        <p className="mt-5 max-w-[390px] text-md2 leading-[1.6] text-subtle sm:mt-0">
          Restock counts are saved as separate activity records so the owner can see when water entered the business.
        </p>
      </div>

      <section className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {products.map(product => {
          const low = product.stock <= product.reorderAt;
          return (
            <Card
              key={product.id}
              className={cn(
                "relative gap-0 overflow-hidden rounded-none p-6 shadow-none",
                low ? "border-warn-line bg-warn-soft" : "border-line bg-panel"
              )}
            >
              <div className="mb-9 grid size-[46px] -rotate-45 place-items-center rounded-[50%_50%_50%_8px] bg-info-soft text-info">
                <Droplet className="size-[22px] rotate-45" aria-hidden="true" />
              </div>
              <span
                className={cn(
                  "absolute top-6 right-6 rounded-full px-2.5 py-[5px] text-xs2 tracking-[.6px] uppercase",
                  low ? "bg-neg-soft text-neg" : "bg-pos-soft text-pos"
                )}
              >
                {low ? "Low stock" : "In stock"}
              </span>

              <h3 className="m-0 mb-[5px] font-serif text-2xl2 font-medium">{product.name}</h3>
              {product.description && <p className="m-0 mb-1.5 text-sm2 leading-[1.45] text-subtle">{product.description}</p>}
              <p className="m-0 text-sm2 text-subtle">
                {product.pack} · Selling at {money(product.price)}
              </p>
              <p className="m-0 mt-1 text-sm2 text-subtle">
                Cost {money(product.costPrice)} ·{" "}
                <span className={cn(product.price - product.costPrice < 0 ? "text-neg" : "text-pos")}>
                  {money(product.price - product.costPrice)} profit
                </span>
              </p>

              <div className="mt-5 flex items-center gap-3 border-t border-line py-5.5">
                <strong className="font-serif text-[clamp(32px,3vw,38px)]">{product.stock}</strong>
                <span className="text-sm2 leading-[1.45] text-subtle">
                  {product.pack.toLowerCase()}s on hand
                  <br />
                  Reorder at {product.reorderAt}
                </span>
              </div>

              <div className="grid grid-cols-[92px_1fr] gap-[7px]">
                <Input
                  aria-label={`Restock quantity for ${product.name}`}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="Qty"
                  value={amounts[product.id] ?? ""}
                  onChange={e => setAmounts({ ...amounts, [product.id]: e.target.value })}
                  className="h-auto min-w-0 rounded-[3px] border-field-line bg-field p-2.5 text-md2"
                />
                <Button
                  onClick={() => {
                    restock(product, toNumber(amounts[product.id] ?? ""));
                    setAmounts({ ...amounts, [product.id]: "" });
                  }}
                  className="h-auto min-w-0 rounded-[3px] py-2.5 text-sm2 font-bold"
                >
                  Add stock
                </Button>
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
