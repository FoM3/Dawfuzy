import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { parseCoords, validPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeliveryMode, Product, ProductSupplier, Supplier, SupplierDraft } from "@/features/ledger/types";

const fieldLabel = "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";

export const deliveryLabel: Record<DeliveryMode, string> = {
  deliver: "They deliver",
  collect: "We go for it"
};

// One empty number to start with; the rest are added as they are needed.
const blank: SupplierDraft = {
  name: "", contactPerson: "", phones: [""], location: "", mapCoords: "",
  delivery: "collect", note: ""
};

type Props = {
  open: boolean;
  setOpen: (open: boolean) => void;
  // The supplier being edited, or null when adding one.
  editing: Supplier | null;
  suppliers: Supplier[];
  products: Product[];
  links: ProductSupplier[];
  saveSupplier: (draft: SupplierDraft, id?: string) => Promise<boolean>;
  setSupplierProducts: (supplierId: string, productIds: string[]) => Promise<void>;
  // Opened from a product, that product starts ticked so the link is made by default.
  presetProductId?: string;
};

// The one supplier form. Both the Suppliers screen and the product sheet open this, so a
// supplier is always created the same way with the same fields and the same rules.
export function SupplierSheet({
  open, setOpen, editing, suppliers, products, links, saveSupplier, setSupplierProducts, presetProductId
}: Props) {
  const [form, setForm] = useState<SupplierDraft>(blank);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickQuery, setPickQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on every open rather than on close, so a half-filled form is never shown again.
  useEffect(() => {
    if (!open) return;
    setPickQuery("");
    setSaving(false);
    if (editing) {
      setForm({
        name: editing.name, contactPerson: editing.contactPerson,
        phones: editing.phones.length ? editing.phones : [""],
        location: editing.location, mapCoords: editing.mapCoords,
        delivery: editing.delivery, note: editing.note
      });
      setPicked(links.filter(link => link.supplierId === editing.id).map(link => link.productId));
      return;
    }
    setForm(blank);
    setPicked(presetProductId ? [presetProductId] : []);
  }, [open, editing, presetProductId, links]);

  const sellable = useMemo(() => products.filter(p => !p.retiredAt), [products]);
  // Ticked ones stay visible while searching, so a filter cannot hide what you already chose.
  const pickable = useMemo(() => {
    const term = pickQuery.trim().toLowerCase();
    if (!term) return sellable;
    return sellable.filter(p => picked.includes(p.id) || p.name.toLowerCase().includes(term));
  }, [sellable, pickQuery, picked]);

  const badPhone = form.phones.some(number => !validPhone(number));
  const coords = parseCoords(form.mapCoords);
  const badCoords = form.mapCoords.trim() !== "" && coords === null;
  const duplicate =
    form.name.trim().length > 0 &&
    suppliers.some(s => s.id !== editing?.id && s.name.trim().toLowerCase() === form.name.trim().toLowerCase());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (duplicate || badCoords || badPhone || saving) return;
    setSaving(true);
    // A new supplier has no id until it is saved, so the links follow rather than lead.
    const id = editing?.id ?? crypto.randomUUID();
    const ok = await saveSupplier({ ...form, name: form.name.trim(), mapCoords: coords ?? "" }, id);
    if (ok) {
      await setSupplierProducts(id, picked);
      setOpen(false);
    }
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 bg-app data-[side=right]:w-full data-[side=right]:sm:max-w-192">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="font-serif text-2xl2 font-medium">
            {editing ? "Edit supplier" : "New supplier"}
          </SheetTitle>
          <SheetDescription className="text-sm2 text-subtle">
            Only admins see this. It never reaches a staff phone.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="grid gap-2">
              <Label htmlFor="supplier-name" className={fieldLabel}>Company or trader</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Everpure depot, Spintex"
                className={fieldInput}
              />
              {duplicate && <p className="m-0 text-sm2 text-neg">Another supplier already uses this name.</p>}
            </div>

            <div className="mt-5 grid gap-2">
              <Label htmlFor="supplier-person" className={fieldLabel}>Person you talk to</Label>
              <Input
                id="supplier-person"
                value={form.contactPerson}
                onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="e.g. Kwame"
                className={fieldInput}
              />
            </div>

            <div className="mt-5 grid gap-2">
              <Label htmlFor="supplier-phone-0" className={fieldLabel}>
                {form.phones.length > 1 ? "Phone numbers" : "Phone"}
              </Label>
              {form.phones.map((number, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    id={`supplier-phone-${index}`}
                    aria-label={index === 0 ? "Phone" : `Phone ${index + 1}`}
                    type="tel"
                    inputMode="tel"
                    value={number}
                    onChange={e =>
                      setForm({ ...form, phones: form.phones.map((n, i) => (i === index ? e.target.value : n)) })
                    }
                    placeholder="024 000 0000"
                    className={cn(fieldInput, "flex-1", !validPhone(number) && "border-neg")}
                  />
                  {form.phones.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove phone ${index + 1}`}
                      onClick={() => setForm({ ...form, phones: form.phones.filter((_, i) => i !== index) })}
                      className="grid size-10 shrink-0 place-items-center rounded-full border-0 bg-transparent text-subtle hover:text-neg"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {badPhone && (
                <p className="m-0 text-sm2 text-neg">
                  A phone number should be digits only, nine to fifteen of them. Spaces,
                  dashes and a leading + are fine.
                </p>
              )}
              <button
                type="button"
                onClick={() => setForm({ ...form, phones: [...form.phones, ""] })}
                className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-field px-3.5 py-2 text-sm2 text-ink hover:border-brandtext"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add another number
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="supplier-location" className={fieldLabel}>Where they are</Label>
                <Input
                  id="supplier-location"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Kasoa, near the market"
                  className={fieldInput}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-coords" className={fieldLabel}>Map pin (optional)</Label>
                <Input
                  id="supplier-coords"
                  value={form.mapCoords}
                  onChange={e => setForm({ ...form, mapCoords: e.target.value })}
                  placeholder="5.6037, -0.1870 or a Maps link"
                  className={fieldInput}
                />
              </div>
            </div>
            {badCoords ? (
              <p className="m-0 mt-2 text-sm2 text-neg">
                Could not find a location in that. Paste a Google Maps link, or type the
                coordinates as two numbers.
              </p>
            ) : (
              coords && <p className="m-0 mt-2 text-sm2 text-subtle">Saves as {coords}, and becomes a map link.</p>
            )}

            <fieldset className="mt-5 m-0 border-0 p-0">
              <legend className={cn(fieldLabel, "mb-2")}>Getting the goods</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(deliveryLabel) as DeliveryMode[]).map(mode => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={form.delivery === mode}
                    onClick={() => setForm({ ...form, delivery: mode })}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm2 transition-colors",
                      form.delivery === mode
                        ? "border-brandtext bg-deep text-on-deep"
                        : "border-line bg-field text-ink hover:border-hover-line"
                    )}
                  >
                    {deliveryLabel[mode]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5 m-0 border-0 p-0">
              <legend className={cn(fieldLabel, "mb-1")}>What we buy from them</legend>
              <p className="m-0 mb-2.5 text-sm2 leading-[1.45] text-subtle">
                Pick as many as apply. Two products of the same brand can come from different
                people, so each one is chosen on its own.
              </p>
              {sellable.length === 0 ? (
                <p className="m-0 text-sm2 text-subtle">No products in the catalogue yet.</p>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm2 text-subtle">
                      {picked.length === 0 ? "None picked" : `${picked.length} picked`}
                    </span>
                    {picked.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPicked([])}
                        className="rounded-full border-0 bg-transparent p-0 text-sm2 text-subtle underline-offset-2 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                    <Input
                      aria-label="Search products"
                      value={pickQuery}
                      onChange={e => setPickQuery(e.target.value)}
                      placeholder="Search products"
                      className={cn(fieldInput, "py-2.5 pl-10")}
                    />
                    {pickQuery && (
                      <button
                        type="button"
                        aria-label="Clear product search"
                        onClick={() => setPickQuery("")}
                        className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full border-0 bg-transparent text-subtle hover:bg-select"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="grid max-h-72 gap-1.5 overflow-y-auto overscroll-contain rounded border border-line bg-field p-2">
                    {pickable.length === 0 && (
                      <p className="m-0 px-2 py-6 text-center text-sm2 text-subtle">
                        No products match “{pickQuery}”.
                      </p>
                    )}
                    {pickable.map(product => {
                      const on = picked.includes(product.id);
                      return (
                        <button
                          type="button"
                          key={product.id}
                          aria-pressed={on}
                          onClick={() =>
                            setPicked(current =>
                              on ? current.filter(id => id !== product.id) : [...current, product.id]
                            )
                          }
                          className={cn(
                            "flex items-center gap-2.5 rounded border px-3 py-2.5 text-left text-md2 transition-colors",
                            on ? "border-brandtext bg-select text-ink" : "border-transparent bg-panel text-ink hover:border-hover-line"
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-4.5 shrink-0 place-items-center rounded-[3px] border",
                              on ? "border-brandtext bg-deep text-on-deep" : "border-field-line bg-field"
                            )}
                            aria-hidden="true"
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{product.name}</span>
                          <small className="shrink-0 text-sm2 text-subtle">{product.pack}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>

            <div className="mt-5 grid gap-2">
              <Label htmlFor="supplier-note" className={fieldLabel}>Anything else</Label>
              <Textarea
                id="supplier-note"
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                rows={3}
                placeholder="e.g. closed Sundays, pays on delivery, ask for the back gate"
                className={cn(fieldInput, "min-h-20 resize-y")}
              />
            </div>
          </div>

          <SheetFooter className="flex-row gap-2 border-t border-line">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 flex-1 border-line text-md2">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={duplicate || badCoords || badPhone || saving}
              className="h-12 flex-1 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Add supplier"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
