import { FormEvent, useMemo, useState } from "react";
import { Archive, Boxes, Droplet, Package, Pencil, Plus, RotateCcw, Search, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { packTypes } from "@/features/ledger/data/mock-data";
import { mapsLink, money, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PackType, Product, ProductDraft, ProductSupplier, Supplier, SupplierDraft } from "@/features/ledger/types";
import { SupplierSheet, deliveryLabel } from "@/features/ledger/components/SupplierSheet";

const fieldLabel = "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";
const th = "px-4 py-3 text-left text-xs2 font-bold tracking-[1.4px] text-subtle uppercase whitespace-nowrap";
const td = "px-4 py-4 text-md2 align-middle";

const packIcon: Record<PackType, typeof Package> = { Pack: Package, Bag: Droplet, Dispenser: Boxes };

const blank = { name: "", description: "", pack: "Pack" as PackType, costPrice: "", price: "" };

type Props = {
  products: Product[];
  // Admin-only. A staff session never receives these, so both arrive empty.
  suppliers: Supplier[];
  supplierLinks: ProductSupplier[];
  saveSupplier: (draft: SupplierDraft, id?: string) => Promise<boolean>;
  setSupplierProducts: (supplierId: string, productIds: string[]) => Promise<void>;
  saveSupplierLink: (link: ProductSupplier) => Promise<void>;
  removeSupplierLink: (productId: string, supplierId: string) => Promise<void>;
  addProduct: (draft: ProductDraft) => string | null;
  updateProduct: (id: string, draft: ProductDraft) => boolean;
  setRetired: (id: string, retired: boolean) => void;
  // Users may read the catalogue but never see cost or profit, and never change it.
  canEdit: boolean;
};

export function ProductsScreen({
  products, addProduct, updateProduct, setRetired, canEdit,
  suppliers, supplierLinks, saveSupplier, setSupplierProducts, saveSupplierLink, removeSupplierLink
}: Props) {
  const [confirmRetire, setConfirmRetire] = useState<Product | null>(null);
  // Set for the moment between creating a product and closing the sheet, while the
  // supplier section is offered.
  const [justAdded, setJustAdded] = useState(false);
  const [addingSource, setAddingSource] = useState("");
  const [sourceCost, setSourceCost] = useState("");
  // The supplier drawer, opened over this one so a source can be created without losing
  // the product being edited.
  const [sourceSheet, setSourceSheet] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // The sources linked to whatever product the sheet is editing, and the ones still free
  // to add. Both are empty for a staff session, which never receives supplier rows at all.
  const linkedSources = useMemo(
    () => supplierLinks
      .filter(link => link.productId === editingId)
      .map(link => ({ link, supplier: suppliers.find(s => s.id === link.supplierId) }))
      .sort((a, b) => (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "")),
    [supplierLinks, suppliers, editingId]
  );
  const sourceCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const link of supplierLinks) counts[link.productId] = (counts[link.productId] ?? 0) + 1;
    return counts;
  }, [supplierLinks]);

  const unlinkedSuppliers = useMemo(
    () => suppliers.filter(s => !s.retiredAt && !linkedSources.some(l => l.link.supplierId === s.id)),
    [suppliers, linkedSources]
  );
  const [form, setForm] = useState(blank);
  const [query, setQuery] = useState("");
  // Retired sits alongside the pack types rather than in its own control: a retired
  // product is otherwise buried in a list of two dozen with nothing to search for.
  const [packFilter, setPackFilter] = useState<PackType | "All" | "Retired">("All");

  // Only offer the unit types actually present in the catalogue.
  const availableTypes = useMemo(() => packTypes.filter(t => products.some(p => p.pack === t)), [products]);
  const retiredCount = products.filter(p => p.retiredAt).length;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter(p =>
        packFilter === "All" ? true : packFilter === "Retired" ? Boolean(p.retiredAt) : p.pack === packFilter
      )
      // No sort: the catalogue arrives ordered, retired last and alphabetical within, and
      // filtering keeps that order.
      .filter(p => !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term));
  }, [products, query, packFilter]);

  const costValue = toNumber(form.costPrice);
  const priceValue = toNumber(form.price);
  const margin = priceValue - costValue;
  const marginPercent = costValue > 0 ? (margin / costValue) * 100 : 0;
  const sellsAtLoss = priceValue > 0 && costValue > 0 && margin < 0;
  const duplicate =
    form.name.trim().length > 0 &&
    products.some(p => p.id !== editingId && p.name.trim().toLowerCase() === form.name.trim().toLowerCase());

  const unit = form.pack.toLowerCase();

  function openAdd() {
    setEditingId(null);
    setForm(blank);
    setJustAdded(false);
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setJustAdded(false);
    setForm({
      name: product.name,
      description: product.description,
      pack: product.pack,
      costPrice: String(product.costPrice),
      price: String(product.price)
    });
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const draft: ProductDraft = {
      name: form.name.trim(),
      description: form.description.trim(),
      pack: form.pack,
      costPrice: costValue,
      price: priceValue
    };
    if (editingId) {
      if (updateProduct(editingId, draft)) setOpen(false);
      return;
    }
    const newId = addProduct(draft);
    if (!newId) return;
    // Held open on the product just created, because the supplier is the thing you know
    // at the moment you add it and would otherwise have to come back for.
    setEditingId(newId);
    setJustAdded(true);
  }

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end lg:mb-8">
        <div>
          <Eyebrow>Products</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            The water
            <br />
            <em className="font-medium text-accent">you sell.</em>
          </h2>
        </div>
        {canEdit && (
          <Button onClick={openAdd} className="h-12 shrink-0 gap-2.5 px-5 text-md2 font-semibold">
            <Plus className="size-4.5" aria-hidden="true" />
            Add product
          </Button>
        )}
      </div>

      <Card className="gap-0 overflow-hidden rounded-none border-line bg-panel p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-4 min-[431px]:px-6">
          <h3 className="m-0 font-serif text-2xl2 font-medium">Catalogue</h3>
          <span className="text-xs2 whitespace-nowrap text-subtle">
            {visible.length === products.length ? `${products.length} products` : `${visible.length} of ${products.length}`}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 border-b border-line px-4.5 py-4 min-[431px]:px-6 lg:flex-row lg:items-center">
          <div className="relative lg:max-w-80 lg:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <Input
              aria-label="Search products"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name"
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

          <div className="flex flex-wrap gap-2">
            {(["All", ...availableTypes, "Retired"] as const).map(type => (
              <button
                type="button"
                key={type}
                aria-pressed={packFilter === type}
                onClick={() => setPackFilter(type)}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm2 transition-colors",
                  packFilter === type ? "border-brandtext bg-deep text-on-deep" : "border-line bg-field text-ink hover:border-hover-line"
                )}
              >
                {type === "All" ? "All" : type === "Retired" ? `Retired${retiredCount ? ` (${retiredCount})` : ""}` : `${type}s`}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="m-0 px-4.5 py-12 text-center text-md2 text-subtle min-[431px]:px-6">
            {packFilter === "Retired" && !query
              ? "Nothing is retired. Retiring a product takes it off the New sale screen without touching past sales."
              : `No products match ${query ? `“${query}”` : "that filter"}.`}
          </p>
        ) : (
        // min-w-0: as a flex child this defaults to min-width:auto and would push the page wide.
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line bg-band">
                <th className={cn(th, "w-12 text-right")}>#</th>
                <th className={th}>Product</th>
                <th className={th}>Sold as</th>
                {canEdit && <th className={cn(th, "text-right")}>Cost</th>}
                <th className={cn(th, "text-right")}>Sells at</th>
                {canEdit && <th className={cn(th, "text-right")}>Profit</th>}
                {/* relative: sr-only is absolutely positioned and would otherwise escape the
                    scroll container and stretch the document. */}
                <th className={cn(th, "relative text-right")}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product, index) => {
                const sources = sourceCount[product.id] ?? 0;
                const profit = product.price - product.costPrice;
                const percent = product.costPrice > 0 ? (profit / product.costPrice) * 100 : 0;
                const Icon = packIcon[product.pack];
                return (
                  <tr key={product.id} className={cn("border-b border-line-soft last:border-b-0", product.retiredAt && "opacity-60")}>
                    <td className={cn(td, "text-right text-sm2 tabular-nums text-faint")}>{index + 1}</td>
                    <td className={cn(td, "min-w-55")}>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-info-soft text-info">
                          <Icon className="size-4.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          {/* The mark rides on the name's line: a product without a source
                              shows nothing, so the row keeps its height. */}
                          <strong className="flex items-center gap-1.5 font-semibold">
                            <span className="min-w-0">{product.name}</span>
                            {canEdit && sources > 0 && (
                              <span
                                title={`${sources} ${sources === 1 ? "supplier" : "suppliers"} linked`}
                                className="shrink-0 text-info"
                              >
                                <Truck className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">
                                  {sources === 1 ? "1 supplier linked" : `${sources} suppliers linked`}
                                </span>
                              </span>
                            )}
                          </strong>
                          {product.retiredAt && (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-band px-2 py-0.5 text-xs2 text-subtle">
                              Retired
                            </span>
                          )}
                          {product.description && (
                            <span className="mt-0.5 block text-sm2 leading-[1.45] text-subtle">{product.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-subtle")}>{product.pack}</td>
                    {canEdit && (
                      <td className={cn(td, "text-right whitespace-nowrap text-subtle")}>{money(product.costPrice)}</td>
                    )}
                    <td className={cn(td, "text-right font-serif text-lg2 whitespace-nowrap")}>{money(product.price)}</td>
                    {canEdit && (
                      <td className={cn(td, "text-right whitespace-nowrap", profit < 0 ? "text-neg" : "text-pos")}>
                        {money(profit)}
                        <span className="block text-sm2 text-subtle">{percent.toFixed(0)}%</span>
                      </td>
                    )}
                    <td className={cn(td, "text-right")}>
                      {canEdit ? (
                        <span className="inline-flex items-center justify-end gap-2">
                          {product.retiredAt ? (
                            // Retired leaves one thing to do. Editing a product that is not
                            // for sale only invites changes nobody will see.
                            <button
                              type="button"
                              onClick={() => setRetired(product.id, false)}
                              aria-label={`Bring back ${product.name}`}
                              className="inline-flex items-center gap-1.5 rounded border border-pos bg-pos px-3.5 py-2 text-sm2 font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90"
                            >
                              <RotateCcw className="size-3.5" aria-hidden="true" /> Bring back
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(product)}
                                aria-label={`Edit ${product.name}`}
                                className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-brandtext transition-colors hover:border-brandtext"
                              >
                                <Pencil className="size-3.5" aria-hidden="true" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRetire(product)}
                                aria-label={`Retire ${product.name}`}
                                className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-neg transition-colors hover:border-neg"
                              >
                                <Archive className="size-3.5" aria-hidden="true" /> Retire
                              </button>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm2 whitespace-nowrap text-faint">&#8212;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <AlertDialog open={!!confirmRetire} onOpenChange={o => !o && setConfirmRetire(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">
              Retire {confirmRetire?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              It stops appearing on the New sale screen. Sales already recorded keep it,
              with the prices they were charged at, and you can bring it back any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Keep selling it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmRetire) setRetired(confirmRetire.id, true); setConfirmRetire(null); }}
              className="h-12 bg-neg text-md2 font-semibold text-white hover:bg-neg/90"
            >
              Retire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SupplierSheet
        open={sourceSheet}
        setOpen={setSourceSheet}
        editing={null}
        suppliers={suppliers}
        products={products}
        links={supplierLinks}
        saveSupplier={saveSupplier}
        setSupplierProducts={setSupplierProducts}
        presetProductId={editingId ?? undefined}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-app data-[side=right]:w-full data-[side=right]:sm:max-w-192">
          <SheetHeader className="border-b border-line">
            <SheetTitle className="font-serif text-2xl2 font-medium">
              {justAdded ? `${form.name} added` : editingId ? "Edit product" : "Add product"}
            </SheetTitle>
            <SheetDescription className="text-sm2 text-subtle">
              {justAdded
                ? "It is in the catalogue and ready to sell. Say where you buy it while you are here, or close this."
                : editingId
                  ? "New prices apply to future sales only; past sales keep their own."
                  : "It joins the catalogue and is ready to sell straight away."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            {/* min-h-0 keeps this scroll area inside the form box instead of covering the footer. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <div className="grid gap-2">
                <Label htmlFor="product-name" className={fieldLabel}>
                  Product name
                </Label>
                <Input
                  id="product-name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Table-top dispenser"
                  className={fieldInput}
                />
                {duplicate && <p className="m-0 text-sm2 text-neg">Another product already uses this name.</p>}
              </div>

              <div className="mt-5 grid gap-2">
                <Label htmlFor="product-description" className={fieldLabel}>
                  Description
                </Label>
                <Textarea
                  id="product-description"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="e.g. Hot and cold water dispenser, table-top unit"
                  className={cn(fieldInput, "min-h-20 resize-y")}
                />
              </div>

              <div className="mt-5 grid gap-2">
                <span className={fieldLabel}>Sold as</span>
                <div className="grid grid-cols-3 gap-2">
                  {packTypes.map(option => {
                    const Icon = packIcon[option];
                    return (
                      <button
                        type="button"
                        key={option}
                        aria-pressed={form.pack === option}
                        onClick={() => setForm({ ...form, pack: option })}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 rounded border py-3 text-sm2 transition-colors",
                          form.pack === option
                            ? "border-brandtext bg-select text-brandtext shadow-[0_0_0_1px_var(--brandtext)_inset]"
                            : "border-line bg-field text-ink hover:border-hover-line"
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden="true" />
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid gap-3 min-[380px]:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="cost-price" className={fieldLabel}>
                    Cost price (GH₵)
                  </Label>
                  <Input
                    id="cost-price"
                    value={form.costPrice}
                    onChange={e => setForm({ ...form, costPrice: e.target.value })}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(fieldInput, "font-serif text-xl2")}
                  />
                  <span className="text-sm2 text-subtle">You pay, per {unit}</span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="selling-price" className={fieldLabel}>
                    Selling price (GH₵)
                  </Label>
                  <Input
                    id="selling-price"
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(fieldInput, "font-serif text-xl2")}
                  />
                  <span className="text-sm2 text-subtle">Customer pays, per {unit}</span>
                </div>
              </div>

              <div className="mt-6 flex items-end justify-between gap-3 bg-deep px-4 py-4 text-white">
                <div>
                  <span className="block text-xs2 font-bold tracking-[1.4px] text-on-deep-label uppercase">Profit per {unit}</span>
                  {costValue > 0 && priceValue > 0 && (
                    <span className={cn("mt-1 block text-sm2", sellsAtLoss ? "text-neg-on-deep" : "text-on-deep-subtle")}>
                      {sellsAtLoss ? "Selling below cost" : `${marginPercent.toFixed(0)}% margin`}
                    </span>
                  )}
                </div>
                <strong className={cn("font-serif text-3xl2", sellsAtLoss && "text-neg-on-deep")}>{money(margin)}</strong>
              </div>

              {sellsAtLoss && (
                <p className="m-0 mt-2 text-sm2 leading-[1.45] text-neg">
                  This cannot be saved: the selling price is below what you pay. Check the two
                  figures, they look the wrong way round.
                </p>
              )}

              {/* Only on an existing product: a link needs a product id, and a new one has
                  none until it is saved. */}
              {canEdit && editingId && (
                <fieldset className="mt-7 m-0 border-0 p-0">
                  <legend className={cn(fieldLabel, "mb-1")}>Where we buy it</legend>
                  <p className="m-0 mb-3 text-sm2 leading-[1.45] text-subtle">
                    Two products of the same brand can come from different people, so this is set per product.
                  </p>

                  {linkedSources.length === 0 ? (
                    <p className="m-0 mb-3 rounded border border-line bg-field px-3.5 py-3 text-sm2 text-subtle">
                      No source recorded yet.
                    </p>
                  ) : (
                    <ul className="m-0 mb-3 grid list-none gap-2 p-0">
                      {linkedSources.map(({ link, supplier }) => (
                        <li key={link.supplierId} className="rounded border border-line bg-field p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <strong className="block text-md2">{supplier?.name ?? "Unknown supplier"}</strong>
                              <span className="mt-0.5 block text-sm2 text-subtle">
                                {[supplier?.contactPerson, supplier?.phones?.[0], supplier?.location]
                                  .filter(Boolean).join(" · ") || "No contact details"}
                                {supplier?.mapCoords && (
                                  <>
                                    {" · "}
                                    <a
                                      href={mapsLink(supplier.mapCoords)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-ink underline-offset-2 hover:underline"
                                    >
                                      Open in Maps
                                    </a>
                                  </>
                                )}
                              </span>
                              <span className="mt-0.5 inline-flex items-center gap-1.5 text-sm2 text-subtle">
                                <Truck className="size-3.5 shrink-0" aria-hidden="true" />
                                {supplier ? deliveryLabel[supplier.delivery] : "—"}
                                {link.unitCost !== null && <> · buys at {money(link.unitCost)}</>}
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-label={`Remove ${supplier?.name ?? "this source"}`}
                              onClick={() => void removeSupplierLink(editingId, link.supplierId)}
                              className="shrink-0 rounded-full border-0 bg-transparent p-1 text-subtle hover:text-neg"
                            >
                              <X className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                          {link.unitCost !== null && link.unitCost !== costValue && (
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, costPrice: String(link.unitCost) })}
                              className="mt-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs2 text-ink hover:border-brandtext"
                            >
                              Use {money(link.unitCost)} as the cost price
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {unlinkedSuppliers.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <div className="grid gap-2">
                        <select
                          aria-label="Add a source"
                          value={addingSource}
                          onChange={e => setAddingSource(e.target.value)}
                          className={cn(fieldInput, "w-full")}
                        >
                          <option value="">Pick an existing supplier...</option>
                          {unlinkedSuppliers.map(supplier => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </select>
                        <Input
                          aria-label="What they charge per unit"
                          value={sourceCost}
                          onChange={e => setSourceCost(e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder={`What they charge per ${unit} (optional)`}
                          className={fieldInput}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!addingSource}
                        onClick={() => {
                          const cost = sourceCost.trim();
                          void saveSupplierLink({
                            productId: editingId,
                            supplierId: addingSource,
                            unitCost: cost === "" ? null : toNumber(cost),
                            note: ""
                          });
                          setAddingSource("");
                          setSourceCost("");
                        }}
                        className="h-12 self-start border-line px-5 text-md2"
                      >
                        Add
                      </Button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSourceSheet(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-field px-4 py-2.5 text-sm2 text-ink hover:border-brandtext"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {suppliers.length === 0 ? "Add the first supplier" : "New supplier"}
                  </button>
                </fieldset>
              )}
            </div>

            <SheetFooter className="flex-row gap-2 border-t border-line">
              {justAdded ? (
                <Button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-12 flex-1 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
                >
                  Done
                </Button>
              ) : (
                <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 flex-1 text-md2">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={duplicate || sellsAtLoss}
                className="h-12 flex-1 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
              >
                {editingId ? "Save changes" : "Save product"}
              </Button>
                </>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
