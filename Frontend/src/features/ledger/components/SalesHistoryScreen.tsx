import { useMemo, useState } from "react";
import { FileDown, PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { money, today, toNumber } from "@/lib/format";
import { formatDay, isSale, saleProfit, shiftDays, startOfMonth, totalOf, withinRange } from "@/lib/ledger";
import { Pagination } from "@/components/pagination";
import { PAGE_SIZE, useSalesPage, useSalesTotals } from "@/features/ledger/data/queries";
import { readPending } from "@/lib/sync";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ExportSheet } from "@/features/ledger/components/ExportSheet";
import type { Account, DateRangePreset, Product, Transaction } from "@/features/ledger/types";

const allPresets: { key: DateRangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" }
];

function rangeFor(preset: DateRangePreset): { from: string; to: string } {
  const now = today();
  if (preset === "today") return { from: now, to: now };
  if (preset === "yesterday") return { from: shiftDays(now, -1), to: shiftDays(now, -1) };
  if (preset === "week") return { from: shiftDays(now, -6), to: now };
  if (preset === "month") return { from: startOfMonth(now), to: now };
  return { from: "", to: "" };
}

const th = "px-3 py-3 text-left text-xs2 font-bold tracking-[1.4px] text-subtle uppercase whitespace-nowrap";
const td = "px-3 py-3.5 text-md2 align-top";

// Users get the two ranges a shift needs: today's till total and a week to spot a
// missed entry. Wider ranges, and the free date fields that could reach them, are admin-only.
type HistoryProps = {
  transactions: Transaction[];
  products: Product[];
  people: Account[];
  isAdmin: boolean;
  currentId: string;
  currentName: string;
  correctSale: (
    sale: Transaction,
    next: { quantity: number; productId: string; note: string } | null
  ) => Promise<string | null>;
};

export function SalesHistoryScreen({ transactions, products, people, isAdmin, currentId, currentName, correctSale }: HistoryProps) {
  const canSeeProfit = isAdmin;
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [removing, setRemoving] = useState<Transaction | null>(null);
  const [draftQty, setDraftQty] = useState("1");
  const [draftProduct, setDraftProduct] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  // Unchanged item keeps the price captured at the time; a different one takes the
  // catalogue's price, which is what the server will apply.
  const draftUnitPrice =
    editing && draftProduct === editing.productId
      ? editing.unitPrice
      : products.find(p => p.id === draftProduct)?.price ?? 0;

  function openEdit(sale: Transaction) {
    setEditing(sale);
    setDraftQty(String(sale.quantity));
    setDraftProduct(sale.productId ?? products[0]?.id ?? "");
    setDraftNote(sale.note ?? "");
    setRowError(null);
  }

  async function submitRow(sale: Transaction, next: { quantity: number; productId: string; note: string } | null) {
    setSavingRow(true);
    const message = await correctSale(sale, next);
    setSavingRow(false);
    if (message) { setRowError(message); return; }
    setEditing(null);
    setRemoving(null);
  }

  // The same rule the server enforces, so the button is not offered where it would fail.
  const canCorrect = (sale: Transaction) =>
    unsent.some(u => u.id === sale.id) || isAdmin || (sale.recordedById === currentId && sale.date === today());

  const [exportOpen, setExportOpen] = useState(false);
  // Users get the ranges a shift needs; the wider ones, and the free date fields that
  // could reach them, stay admin-only.
  const staffPresets: DateRangePreset[] = ["today", "yesterday", "week"];
  const presets = isAdmin ? allPresets : allPresets.filter(preset => staffPresets.includes(preset.key));
  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [from, setFrom] = useState(rangeFor("today").from);
  const [to, setTo] = useState(rangeFor("today").to);
  const [page, setPage] = useState(0);

  // Any change of range restarts at the first page; staying on page 5 of a range that
  // now has two pages would show an empty table.
  function applyPreset(key: DateRangePreset) {
    setPreset(key);
    const range = rangeFor(key);
    setFrom(range.from);
    setTo(range.to);
    setPage(0);
  }

  const salesPage = useSalesPage(from, to, page, isAdmin);
  const totalsQuery = useSalesTotals(from, to);

  // Without a backend everything is in memory, so filter and slice it here instead.
  const localRows = useMemo(
    () =>
      transactions
        .filter(isSale)
        .filter(t => withinRange(t.date, from, to))
        .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date))),
    [transactions, from, to]
  );

  // Sales that have not reached the server are not in any page it returns, so they are
  // shown on the first page. Without this an offline sale is saved and invisible, which
  // reads as lost.
  const unsent = useMemo(
    () =>
      isSupabaseConfigured
        ? readPending()
            .filter(t => withinRange(t.date, from, to))
            .sort((a, b) => b.id.localeCompare(a.id))
        : [],
    [from, to, transactions]
  );

  const served = isSupabaseConfigured
    ? salesPage.data?.rows ?? []
    : localRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows = page === 0 ? [...unsent, ...served] : served;
  const count = (isSupabaseConfigured ? salesPage.data?.total ?? 0 : localRows.length) + unsent.length;

  // Totals come from a server-side rollup over the whole range. Summing the rows on
  // screen would describe one page of 20 and quietly under-report the day's takings.
  const totals = isSupabaseConfigured
    ? totalsQuery.data ?? { revenue: 0, profit: 0, units: 0, count: 0 }
    : {
        revenue: totalOf(localRows, t => t.amount),
        profit: totalOf(localRows, saleProfit),
        units: totalOf(localRows, t => t.quantity),
        count: localRows.length
      };

  const { revenue, profit, units } = totals;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  // The table footer sums only what is on screen, so it reconciles with the rows above it.
  const pageRevenue = totalOf(rows, t => t.amount);
  const pageProfit = totalOf(rows, saleProfit);
  const pageUnits = totalOf(rows, t => t.quantity);

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end lg:mb-8">
        <div>
          <Eyebrow>Sales history</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            Every sale,
            <br />
            <em className="font-medium text-accent">on the record.</em>
          </h2>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="h-12 shrink-0 gap-2.5 border-line px-5 text-md2"
          >
            <FileDown className="size-4.5" aria-hidden="true" />
            Export PDF
          </Button>
        )}
      </div>

      <Card className="mb-4 gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
        <p className="m-0 mb-3 text-xs2 font-bold tracking-[1.4px] text-subtle uppercase">Filter by date</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={preset === key}
              onClick={() => applyPreset(key)}
              className={cn(
                "rounded-full border px-3.5 py-2.5 text-sm2 transition-colors",
                preset === key ? "border-brandtext bg-deep text-white" : "border-line bg-field text-ink hover:border-hover-line"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2 sm:max-w-125">
            <div className="grid gap-1.75">
              <Label htmlFor="from-date" className="text-xs2 text-subtle">
                From
              </Label>
              <Input
                id="from-date"
                type="date"
                value={from}
                max={to || undefined}
                onChange={e => { setFrom(e.target.value); setPreset("custom"); }}
                className="h-auto rounded-[3px] border-field-line bg-field p-3 text-md2"
              />
            </div>
            <div className="grid gap-1.75">
              <Label htmlFor="to-date" className="text-xs2 text-subtle">
                To
              </Label>
              <Input
                id="to-date"
                type="date"
                value={to}
                min={from || undefined}
                onChange={e => { setTo(e.target.value); setPreset("custom"); }}
                className="h-auto rounded-[3px] border-field-line bg-field p-3 text-md2"
              />
            </div>
          </div>
        )}
      </Card>

      <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(var(--stat-min),1fr))] gap-2 min-[431px]:gap-3">
        {[
          { label: "Revenue", value: money(revenue), note: "Total taken in", accent: true },
          ...(canSeeProfit ? [{ label: "Profit", value: money(profit), note: `${margin.toFixed(0)}% margin` }] : []),
          { label: "Units sold", value: String(units), note: "Packs and bags" },
          { label: "Sales", value: String(totals.count), note: "Entries in range" }
        ].map(stat => (
          <Card
            key={stat.label}
            className={cn(
              "flex min-w-0 flex-col gap-0 rounded-none border-line p-4 shadow-none min-[431px]:p-5",
              stat.accent ? "border-deep-2 bg-deep-2 text-white" : "bg-panel"
            )}
          >
            <span className={cn("text-xs2", stat.accent ? "text-on-deep-subtle" : "text-subtle")}>{stat.label}</span>
            <strong className="my-[7px] mt-4 font-serif text-[clamp(20px,3.2vw,30px)] whitespace-nowrap">{stat.value}</strong>
            <span className={cn("text-xs2", stat.accent ? "text-on-deep-subtle" : "text-faint")}>{stat.note}</span>
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden rounded-none border-line bg-panel p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-4 min-[431px]:px-6">
          <h3 className="m-0 font-serif text-2xl2 font-medium">Items sold</h3>
          <span className="text-xs2 whitespace-nowrap text-subtle">
            {from || to ? `${from ? formatDay(from) : "start"} – ${to ? formatDay(to) : "now"}` : "All time"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-4.5 py-12 text-center text-md2 text-subtle min-[431px]:px-6">No sales in this date range.</p>
        ) : (
          // min-w-0: as a flex child this defaults to min-width:auto and would push the page wide.
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-band">
                  <th className={th}>Date</th>
                  <th className={th}>Item</th>
                  <th className={th}>By</th>
                  <th className={cn(th, "text-right")}>Qty</th>
                  <th className={cn(th, "text-right")}>Unit price</th>
                  <th className={cn(th, "text-right")}>Total</th>
                  {canSeeProfit && <th className={cn(th, "text-right")}>Profit</th>}
                  <th className={cn(th, "relative text-right")}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const rowProfit = saleProfit(row);
                  return (
                    <tr key={row.id} className="border-b border-line-soft last:border-b-0">
                      <td className={cn(td, "whitespace-nowrap text-subtle")}>
                        {formatDay(row.date)}
                        <span className="block text-sm2 text-faint">{row.time}</span>
                      </td>
                      <td className={cn(td, "min-w-45 font-semibold")}>
                        {row.item}
                        {unsent.some(u => u.id === row.id) && (
                          <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs2 whitespace-nowrap text-accent">
                            Not sent yet
                          </span>
                        )}
                        {row.note && (
                          <span className="mt-0.5 block text-sm2 leading-[1.45] font-normal wrap-anywhere text-subtle">
                            {row.note}
                          </span>
                        )}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-subtle")}>{row.recordedBy || "—"}</td>
                      <td className={cn(td, "text-right whitespace-nowrap")}>{row.quantity}</td>
                      <td className={cn(td, "text-right whitespace-nowrap text-subtle")}>{money(row.unitPrice)}</td>
                      <td className={cn(td, "text-right font-serif text-lg2 whitespace-nowrap")}>{money(row.amount)}</td>
                      {canSeeProfit && (
                        <td className={cn(td, "text-right whitespace-nowrap", rowProfit < 0 ? "text-neg" : "text-pos")}>
                          {money(rowProfit)}
                        </td>
                      )}
                      <td className={cn(td, "text-right")}>
                        {canCorrect(row) ? (
                          <span className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              aria-label={`Correct ${row.item} on ${formatDay(row.date)}`}
                              className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-2.5 py-1.5 text-sm2 whitespace-nowrap text-ink transition-colors hover:border-brandtext"
                            >
                              <PencilLine className="size-3.5" aria-hidden="true" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRemoving(row); setRowError(null); }}
                              aria-label={`Remove ${row.item} on ${formatDay(row.date)}`}
                              className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-2.5 py-1.5 text-sm2 whitespace-nowrap text-neg transition-colors hover:border-neg"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        ) : (
                          <span className="text-sm2 whitespace-nowrap text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* Adds up the rows above it. The figures for the whole range are the
                    cards at the top of the screen, which do not move as you page. */}
                <tr className="border-t-2 border-line bg-band">
                  <td className={cn(td, "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase")} colSpan={3}>
                    This page
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{pageUnits}</td>
                  <td className={td} />
                  <td className={cn(td, "text-right font-serif text-lg2 whitespace-nowrap")}>{money(pageRevenue)}</td>
                  {canSeeProfit && (
                    <td className={cn(td, "text-right font-serif text-lg2 whitespace-nowrap", pageProfit < 0 ? "text-neg" : "text-pos")}>
                      {money(pageProfit)}
                    </td>
                  )}
                  <td className={td} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          total={count}
          pageSize={PAGE_SIZE}
          setPage={setPage}
          busy={salesPage.isFetching}
          noun="sales"
        />
      </Card>

      <ExportSheet
        open={exportOpen}
        setOpen={setExportOpen}
        kind="sales"
        isAdmin={isAdmin}
        accountName={currentName}
        products={products}
        people={people}
        localTransactions={transactions}
      />

      <AlertDialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">Correct this sale</AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              Recorded on {editing ? formatDay(editing.date) : ""}. Change the item, the
              quantity or the note; the price comes from the product.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-item" className="text-xs2 font-bold tracking-[1.4px] text-subtle uppercase">Item</Label>
              <Select
                value={draftProduct}
                onValueChange={value => { setDraftProduct(value); setRowError(null); }}
              >
                <SelectTrigger
                  id="edit-item"
                  className="h-auto w-full rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink"
                >
                  <SelectValue placeholder="Pick an item" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.id} className="text-md2">
                      {product.name} · {money(product.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-qty" className="text-xs2 font-bold tracking-[1.4px] text-subtle uppercase">Quantity</Label>
              <Input
                id="edit-qty"
                value={draftQty}
                onChange={e => { setDraftQty(e.target.value.replace(/\D/g, "")); setRowError(null); }}
                inputMode="numeric"
                className="h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-note" className="text-xs2 font-bold tracking-[1.4px] text-subtle uppercase">
                Note (optional)
              </Label>
              <Textarea
                id="edit-note"
                value={draftNote}
                onChange={e => { setDraftNote(e.target.value.slice(0, 300)); setRowError(null); }}
                rows={2}
                placeholder="Who bought it, paid later, a damaged pack..."
                className="h-auto min-h-16 resize-y rounded-[3px] border-field-line bg-field p-3.5 text-md2"
              />
            </div>
            <p className="m-0 text-sm2 text-subtle">
              New total: <strong className="font-serif text-md2 text-ink">{money(toNumber(draftQty) * draftUnitPrice)}</strong>
            </p>
            {rowError && <p className="m-0 text-sm2 text-neg">{rowError}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingRow || toNumber(draftQty) < 1}
              onClick={event => {
                event.preventDefault();
                if (editing) {
                  void submitRow(editing, {
                    quantity: toNumber(draftQty),
                    productId: draftProduct,
                    note: draftNote.trim()
                  });
                }
              }}
              className="h-12 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              {savingRow ? "Saving…" : "Save correction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={o => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">Remove this sale?</AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              {removing?.quantity} × {removing?.item} for {removing ? money(removing.amount) : ""} on{" "}
              {removing ? formatDay(removing.date) : ""}. It comes off every total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rowError && <p className="m-0 text-sm2 text-neg">{rowError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingRow}
              onClick={event => { event.preventDefault(); if (removing) void submitRow(removing, null); }}
              className="h-12 bg-neg text-md2 font-semibold text-white hover:bg-neg/90"
            >
              {savingRow ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
