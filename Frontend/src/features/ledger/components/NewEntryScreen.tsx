import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Droplet, Minus, Plus, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { packTypes } from "@/features/ledger/data/mock-data";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EntryForm, PackType } from "@/features/ledger/types";

const legend = "mb-3 block text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";

// Beyond this many tiles the picker scrolls instead of pushing the rest of the form off-screen.
const SCROLL_AFTER = 8;

export function NewEntryScreen(form: EntryForm) {
  const { selected, quantityValue } = form;
  const total = (selected?.price ?? 0) * quantityValue;
  const profit = ((selected?.price ?? 0) - (selected?.costPrice ?? 0)) * quantityValue;
  const step = (by: number) => form.setQuantity(String(Math.max(1, quantityValue + by)));

  const [query, setQuery] = useState("");

  // Only offer the type filter for types actually in the catalogue.
  const availableTypes = useMemo(
    () => packTypes.filter(type => form.products.some(p => p.pack === type && !p.retiredAt)),
    [form.products]
  );

  // Bags are what the shop sells most of, so open on them. A catalogue with none would
  // otherwise open on an empty list, so fall back to everything.
  const hasBags = availableTypes.includes("Bag");
  const [packFilter, setPackFilter] = useState<PackType | "All">(hasBags ? "Bag" : "All");

  // The catalogue arrives after the first render, and bags may appear or disappear when an
  // admin edits it. Only correct an untouched filter, never one somebody chose.
  const [filterTouched, setFilterTouched] = useState(false);
  useEffect(() => {
    if (filterTouched) return;
    setPackFilter(hasBags ? "Bag" : "All");
  }, [hasBags, filterTouched]);

  function chooseFilter(next: PackType | "All") {
    setFilterTouched(true);
    setPackFilter(next);
  }

  // The best seller, found by units sold rather than by position.
  const topSellerId = useMemo(() => {
    let best = "";
    let most = 0;
    for (const [id, units] of Object.entries(form.popularity)) {
      if (units > most) { best = id; most = units; }
    }
    return most > 0 ? best : "";
  }, [form.popularity]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = form.products
      // Retired products stay in the catalogue and on past sales, but cannot be sold again.
      .filter(p => !p.retiredAt)
      .filter(p => packFilter === "All" || p.pack === packFilter)
      .filter(p => !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term));
    // The best seller leads, then the catalogue's own alphabetical order. Sorting the whole
    // grid by sales moved every tile about as the day went on; one pinned leader that rarely
    // changes keeps the rest where the hand already expects them.
    const lead = matches.findIndex(p => p.id === topSellerId);
    return lead < 1 ? matches : [matches[lead], ...matches.slice(0, lead), ...matches.slice(lead + 1)];
  }, [form.products, query, packFilter, topSellerId]);

  const showFinder = form.products.length > 6;
  const scrolls = visible.length > SCROLL_AFTER;

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 lg:mb-8">
        <Eyebrow>New entry</Eyebrow>
        <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
          What did the shop
          <br />
          <em className="font-medium text-accent">sell?</em>
        </h2>
      </div>

      <form onSubmit={form.submit} className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-3.5 border border-line bg-panel p-5 min-[431px]:p-6.5">
          <fieldset className="m-0 border-0 p-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <legend className={cn(legend, "mb-0")}>Which water?</legend>
              {showFinder && (
                <span className="text-sm2 text-subtle">
                  {visible.length} of {form.products.length}
                </span>
              )}
            </div>

            {showFinder && (
              <div className="mb-3 flex flex-col gap-2.5">
                <div className="relative">
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

                {availableTypes.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {(["All", ...availableTypes] as const).map(type => (
                      <button
                        type="button"
                        key={type}
                        aria-pressed={packFilter === type}
                        onClick={() => chooseFilter(type)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-sm2 transition-colors",
                          packFilter === type ? "border-brandtext bg-deep text-white" : "border-line bg-field text-ink hover:border-hover-line"
                        )}
                      >
                        {type === "All" ? "All" : `${type}s`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {visible.length === 0 ? (
              <p className="m-0 rounded border border-line bg-field px-4 py-8 text-center text-md2 text-subtle">
                No products match “{query}”.
              </p>
            ) : (
            <div
              className={cn(
                // One column of compact rows on a phone: two columns of cards made every
                // longer name wrap and fitted only three on screen at a time.
                "grid grid-cols-1 gap-1.5 min-[431px]:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] min-[431px]:gap-2.5",
                scrolls && "max-h-105 overflow-y-auto overscroll-contain pr-1"
              )}
            >
              {visible.map(product => {
                const isPicked = product.id === form.productId;
                const isTopSeller = showFinder && product.id === topSellerId;
                return (
                  <button
                    type="button"
                    key={product.id}
                    aria-pressed={isPicked}
                    onClick={() => form.selectProduct(product.id)}
                    className={cn(
                      "relative flex items-center gap-3 rounded border bg-field p-2.5 text-left text-ink transition-colors",
                      "min-[431px]:flex-col min-[431px]:items-start min-[431px]:gap-1 min-[431px]:p-3.5",
                      isPicked ? "border-brandtext bg-select shadow-[0_0_0_1px_var(--brandtext)_inset]" : "border-line hover:border-hover-line"
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft text-info min-[431px]:mb-1.5 min-[431px]:size-8">
                      <Droplet className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5 min-[431px]:flex-none">
                      <strong className="truncate text-md2 leading-tight min-[431px]:whitespace-normal">
                        {product.name}
                      </strong>
                      <small className="truncate text-sm2 whitespace-nowrap text-subtle min-[431px]:whitespace-normal">
                        {money(product.price)} · {product.pack}
                      </small>
                    </span>
                    {isPicked && (
                      <Check className="size-4.5 shrink-0 text-brandtext min-[431px]:hidden" aria-hidden="true" />
                    )}
                    {isTopSeller && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs2 text-gold-ink min-[431px]:absolute min-[431px]:top-2.5 min-[431px]:right-2.5">
                        <Star className="size-3" aria-hidden="true" /> Top
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            )}
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className={legend}>How many?</legend>
            <div className="grid grid-cols-[52px_1fr_52px] gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => step(-1)}
                className="grid place-items-center rounded-[3px] border border-line bg-field text-brandtext transition-colors hover:border-brandtext hover:bg-select"
              >
                <Minus className="size-5" aria-hidden="true" />
              </button>
              <Input
                aria-label="Quantity"
                value={form.quantity}
                onChange={e => form.setQuantity(e.target.value)}
                required
                type="number"
                min="1"
                inputMode="numeric"
                className={cn(fieldInput, "text-center font-serif text-2xl2")}
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => step(1)}
                className="grid place-items-center rounded-[3px] border border-line bg-field text-brandtext transition-colors hover:border-brandtext hover:bg-select"
              >
                <Plus className="size-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2.5 mb-0 text-sm2 text-subtle">
              {selected
                ? `${selected.pack}s of ${selected.name} at ${money(selected.price)} each`
                : "Pick a water above to see the price."}
            </p>
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className={legend}>Anything to note? (optional)</legend>
            <Textarea
              value={form.note}
              onChange={e => form.setNote(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="Who bought it, paid later, a damaged pack..."
              className={cn(fieldInput, "min-h-20 resize-y")}
            />
          </fieldset>
        </div>

        <aside className="min-w-0 bg-deep p-4.5 text-white min-[431px]:p-6.5 lg:sticky lg:top-26.5">
          <p className="m-0 mb-1.5 text-xs2 font-bold tracking-[1.4px] text-on-deep-label">SUMMARY</p>
          <h3 className={cn("m-0 mb-5 font-serif text-2xl2 leading-[1.2] font-medium", !selected && "text-on-deep-subtle")}>
            {selected ? selected.name : "Nothing picked yet"}
          </h3>

          <dl className="m-0 border-t border-white/15">
            <div className="flex justify-between gap-3 border-b border-white/10 py-2.5">
              <dt className="text-sm2 text-on-deep-subtle">Quantity</dt>
              <dd className="m-0 text-sm2">{quantityValue || 0}</dd>
            </div>
            {form.canSeeProfit && (
              <div className="flex justify-between gap-3 border-b border-white/10 py-2.5">
                <dt className="text-sm2 text-on-deep-subtle">Profit</dt>
                <dd className={cn("m-0 text-sm2", profit < 0 && "text-neg-on-deep")}>{money(profit)}</dd>
              </div>
            )}
          </dl>

          <div className="flex items-end justify-between gap-3 py-5">
            <span className="text-sm2 text-on-deep-subtle">Total</span>
            <strong className="font-serif text-3xl2">{money(total)}</strong>
          </div>

          <Button
            type="submit"
            disabled={!selected}
            className="h-12 w-full gap-2.5 bg-accent px-5 text-md2 font-semibold text-on-accent hover:bg-accent-hover"
          >
            Save sale
            <ArrowRight className="size-4.5" aria-hidden="true" />
          </Button>
          <p className="m-0 mt-2.5 text-center text-xs2 text-on-deep-faint">Saved safely on this device, even without internet.</p>
        </aside>
      </form>
    </div>
  );
}
