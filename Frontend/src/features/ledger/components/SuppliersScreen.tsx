import { useMemo, useState } from "react";
import { MapPin, Pencil, Phone, Plus, Search, Trash2, Truck, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { SupplierSheet, deliveryLabel } from "@/features/ledger/components/SupplierSheet";
import { mapsLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, ProductSupplier, Supplier, SupplierDraft } from "@/features/ledger/types";

const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";

type Props = {
  suppliers: Supplier[];
  links: ProductSupplier[];
  products: Product[];
  saveSupplier: (draft: SupplierDraft, id?: string) => Promise<boolean>;
  removeSupplier: (id: string) => Promise<void>;
  setSupplierProducts: (supplierId: string, productIds: string[]) => Promise<void>;
};

export function SuppliersScreen({ suppliers, links, products, saveSupplier, removeSupplier, setSupplierProducts }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [confirming, setConfirming] = useState<Supplier | null>(null);

  const productName = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p.name])) as Record<string, string>,
    [products]
  );

  // What each supplier sells us, which is the question the list is usually opened to answer.
  const supplied = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const link of links) {
      const name = productName[link.productId];
      if (!name) continue;
      (map[link.supplierId] = map[link.supplierId] ?? []).push(name);
    }
    for (const list of Object.values(map)) list.sort();
    return map;
  }, [links, productName]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter(s =>
      [s.name, s.contactPerson, ...s.phones, s.location, ...(supplied[s.id] ?? [])]
        .join(" ").toLowerCase().includes(term)
    );
  }, [suppliers, query, supplied]);

  function startAdd() {
    setEditing(null);
    setOpen(true);
  }

  function startEdit(supplier: Supplier) {
    setEditing(supplier);
    setOpen(true);
  }

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end lg:mb-8">
        <div>
          <Eyebrow>Suppliers</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            Where the water
            <br />
            <em className="font-medium text-accent">comes from.</em>
          </h2>
        </div>
        <Button onClick={startAdd} className="h-12 shrink-0 gap-2.5 bg-accent px-5 text-md2 font-semibold text-on-accent hover:bg-accent-hover">
          <Plus className="size-4.5" aria-hidden="true" />
          Add supplier
        </Button>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-110">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input
            aria-label="Search suppliers"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, person, phone, place or product"
            className={cn(fieldInput, "pl-11")}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full border-0 bg-transparent text-subtle hover:bg-select"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="m-0 text-sm2 text-subtle">
          {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"} · admins only
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-none border border-line bg-panel px-6 py-16 text-center">
          <p className="m-0 text-md2 text-subtle">
            {suppliers.length === 0
              ? "No suppliers yet. Add the first one and tick the products you buy from them."
              : `No suppliers match “${query}”.`}
          </p>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(supplier => {
            const items = supplied[supplier.id] ?? [];
            return (
              <li key={supplier.id} className="flex flex-col border border-line bg-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 min-w-0 font-serif text-xl2 leading-tight font-medium wrap-anywhere">
                    {supplier.name}
                  </h3>
                  {/* Quiet icon buttons: on a card the name should carry the weight, not the actions. */}
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(supplier)}
                      aria-label={`Edit ${supplier.name}`}
                      className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-subtle transition-colors hover:bg-field hover:text-ink"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(supplier)}
                      aria-label={`Remove ${supplier.name}`}
                      className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-subtle transition-colors hover:bg-neg-soft hover:text-neg"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <dl className="m-0 mt-3 grid gap-1.75 text-sm2">
                  {supplier.contactPerson && (
                    <div className="flex items-start gap-2">
                      <dt className="mt-0.5 shrink-0 text-subtle">
                        <User className="size-4" aria-hidden="true" />
                        <span className="sr-only">Person</span>
                      </dt>
                      <dd className="m-0 min-w-0 text-ink">{supplier.contactPerson}</dd>
                    </div>
                  )}

                  {supplier.phones.length > 0 && (
                    <div className="flex items-start gap-2">
                      <dt className="mt-0.5 shrink-0 text-subtle">
                        <Phone className="size-4" aria-hidden="true" />
                        <span className="sr-only">Phone</span>
                      </dt>
                      <dd className="m-0 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                        {supplier.phones.map(number => (
                          <a key={number} href={`tel:${number}`} className="text-ink underline-offset-2 hover:underline">
                            {number}
                          </a>
                        ))}
                      </dd>
                    </div>
                  )}

                  {(supplier.location || supplier.mapCoords) && (
                    <div className="flex items-start gap-2">
                      <dt className="mt-0.5 shrink-0 text-subtle">
                        <MapPin className="size-4" aria-hidden="true" />
                        <span className="sr-only">Where</span>
                      </dt>
                      <dd className="m-0 min-w-0 text-ink">
                        {supplier.location || "Pinned on the map"}
                        {supplier.mapCoords && (
                          <>
                            {"  "}
                            <a
                              href={mapsLink(supplier.mapCoords)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-subtle underline-offset-2 hover:text-ink hover:underline"
                            >
                              Open map
                            </a>
                          </>
                        )}
                      </dd>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <dt className="mt-0.5 shrink-0 text-subtle">
                      <Truck className="size-4" aria-hidden="true" />
                      <span className="sr-only">Getting the goods</span>
                    </dt>
                    <dd className="m-0 min-w-0 text-ink">{deliveryLabel[supplier.delivery]}</dd>
                  </div>
                </dl>

                {supplier.note && (
                  <p className="m-0 mt-3 border-l-2 border-line pl-3 text-sm2 leading-[1.5] wrap-anywhere text-subtle">
                    {supplier.note}
                  </p>
                )}

                {/* mt-auto pins this to the bottom so cards in a row line up whatever their height. */}
                <div className="mt-auto pt-4">
                  <p className="m-0 mb-1.5 text-xs2 font-bold tracking-[1.4px] text-subtle uppercase">Supplies</p>
                  {items.length === 0 ? (
                    <p className="m-0 text-sm2 text-faint">Nothing linked yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(name => (
                        <span key={name} className="rounded-full bg-field px-2.5 py-1 text-xs2 text-subtle">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={Boolean(confirming)} onOpenChange={next => !next && setConfirming(null)}>
        <AlertDialogContent className="border-line bg-app">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">Remove {confirming?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              This also unlinks them from every product they supply. Past sales and their prices are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 border-line text-md2">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirming) void removeSupplier(confirming.id); setConfirming(null); }}
              className="h-12 bg-neg text-md2 text-white hover:bg-neg"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SupplierSheet
        open={open}
        setOpen={setOpen}
        editing={editing}
        suppliers={suppliers}
        products={products}
        links={links}
        saveSupplier={saveSupplier}
        setSupplierProducts={setSupplierProducts}
      />
    </div>
  );
}
