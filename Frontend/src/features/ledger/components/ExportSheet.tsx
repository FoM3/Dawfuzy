import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchAllSales } from "@/features/ledger/data/queries";
import { money, today } from "@/lib/format";
import {
  bucketSales, endOfMonth, formatDay, isSale, saleProfit, shiftDays, shiftMonths,
  startOfMonth, startOfWeek, totalOf, withinRange
} from "@/lib/ledger";
import type { Grouping } from "@/lib/ledger";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Account, Product, Transaction } from "@/features/ledger/types";
import type { ProductLine } from "@/lib/pdf";

const fieldLabel = "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";

// The periods a shop actually asks for, which is why they live here rather than as more
// tabs on the screen: this is where a report gets scoped.
const periods = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "days7", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "days30", label: "Last 30 days" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates" }
] as const;

type Period = (typeof periods)[number]["key"];

function boundsFor(period: Period, from: string, to: string): { from: string; to: string } {
  const now = today();
  switch (period) {
    case "today": return { from: now, to: now };
    case "yesterday": return { from: shiftDays(now, -1), to: shiftDays(now, -1) };
    case "week": return { from: startOfWeek(now), to: now };
    case "lastWeek": {
      const start = shiftDays(startOfWeek(now), -7);
      return { from: start, to: shiftDays(start, 6) };
    }
    case "days7": return { from: shiftDays(now, -6), to: now };
    case "month": return { from: startOfMonth(now), to: now };
    case "lastMonth": {
      const start = shiftMonths(now, -1);
      return { from: start, to: endOfMonth(start) };
    }
    case "days30": return { from: shiftDays(now, -29), to: now };
    case "custom": return { from, to };
    default: return { from: "", to: "" };
  }
}

const ALL = "__all__";

// The first two fold every day in the range together to show the shop's rhythm; the rest walk
// the calendar to show the trend.
const groupings: { key: Grouping; label: string }[] = [
  { key: "hourOfDay", label: "Hour of the day" },
  { key: "weekday", label: "Day of the week" },
  { key: "day", label: "Day by day" },
  { key: "week", label: "Week by week" },
  { key: "month", label: "Month by month" }
];

type Shape = "simple" | "detailed" | "time";

type Props = {
  open: boolean;
  setOpen: (open: boolean) => void;
  kind: "sales" | "summary";
  isAdmin: boolean;
  accountName: string;
  products: Product[];
  people: Account[];
  // Only used when there is no backend to query.
  localTransactions: Transaction[];
};

export function ExportSheet({ open, setOpen, kind, isAdmin, accountName, products, people, localTransactions }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(startOfMonth(today()));
  const [customTo, setCustomTo] = useState(today());
  const [person, setPerson] = useState(ALL);
  // Simple is one flat list. Detailed splits the range into days and adds the breakdowns.
  // Time is the distribution: one row per slice of time rather than per sale.
  const [detail, setDetail] = useState<Shape>("simple");
  const [grouping, setGrouping] = useState<Grouping>("hourOfDay");
  const [productId, setProductId] = useState(ALL);
  const [busy, setBusy] = useState(false);

  const { from, to } = boundsFor(period, customFrom, customTo);
  const invalid = period === "custom" && customFrom && customTo && customFrom > customTo;
  // The detailed report is the breakdowns by person and by product. Narrowing to one of
  // either leaves those pages with a single row, so the choice is not offered.
  const wholeShop = kind === "sales" && detail === "detailed";

  function chooseDetail(value: Shape) {
    setDetail(value);
    if (value !== "detailed") return;
    setPerson(ALL);
    setProductId(ALL);
  }

  async function run() {
    setBusy(true);
    try {
      const filters = {
        person: person === ALL ? undefined : person,
        productId: productId === ALL ? undefined : productId
      };

      const rows = isSupabaseConfigured
        ? await fetchAllSales(from, to, isAdmin, filters)
        : localTransactions
            .filter(isSale)
            .filter(t => withinRange(t.date, from, to))
            .filter(t => (filters.person ? t.recordedBy === filters.person : true))
            .filter(t => (filters.productId ? t.productId === filters.productId : true));

      if (rows.length === 0) {
        toast.error("No sales match that selection");
        setBusy(false);
        return;
      }

      // Totals are summed from the fetched rows rather than the SQL rollups: the rollups
      // take a date range only, so they would ignore the person and product filters and
      // report figures that do not match the rows in the document.
      const totals = {
        revenue: totalOf(rows, r => r.amount),
        profit: totalOf(rows, saleProfit),
        units: totalOf(rows, r => r.quantity),
        count: rows.length
      };

      const pdf = await import("@/lib/pdf");
      const scope = [
        person === ALL ? null : person,
        productId === ALL ? null : products.find(p => p.id === productId)?.name ?? null
      ].filter(Boolean) as string[];

      if (detail === "time") {
        await pdf.downloadTimeDistributionReport({
          buckets: bucketSales(rows, grouping, from, to),
          totals, grouping, from, to, isAdmin, by: accountName, scope
        });
      } else if (kind === "sales") {
        const report = { rows, totals, from, to, isAdmin, by: accountName, scope, products };
        if (detail === "detailed") await pdf.downloadDetailedSalesReport(report);
        else await pdf.downloadSimpleSalesReport(report);
      } else {
        // Prices come from the sales, never the catalogue: each carries what it was actually
        // charged at, so a later price change cannot rewrite an old report. Both ends are kept
        // so a product that moved price mid-period shows a range rather than one misleading figure.
        const byProduct = new Map<string, ProductLine>();
        for (const r of rows) {
          const row = byProduct.get(r.item) ?? {
            name: r.item, units: 0, revenue: 0, profit: 0,
            sellLow: r.unitPrice, sellHigh: r.unitPrice,
            costLow: r.costPrice, costHigh: r.costPrice
          };
          row.units += r.quantity;
          row.revenue += r.amount;
          row.profit += saleProfit(r);
          row.sellLow = Math.min(row.sellLow, r.unitPrice);
          row.sellHigh = Math.max(row.sellHigh, r.unitPrice);
          row.costLow = Math.min(row.costLow, r.costPrice);
          row.costHigh = Math.max(row.costHigh, r.costPrice);
          byProduct.set(r.item, row);
        }
        const byPerson = new Map<string, { name: string; count: number; revenue: number }>();
        for (const r of rows) {
          const name = r.recordedBy ?? "Unattributed";
          const row = byPerson.get(name) ?? { name, count: 0, revenue: 0 };
          row.count += 1;
          row.revenue += r.amount;
          byPerson.set(name, row);
        }
        const days = new Set(rows.map(r => r.date)).size || 1;
        await pdf.downloadAnalyticsReport({
          rows,
          totals,
          products: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue),
          people: [...byPerson.values()].sort((a, b) => b.revenue - a.revenue),
          perDay: totals.revenue / days,
          from, to, isAdmin, by: accountName, scope
        });
      }

      toast.success(`Exported ${rows.length} ${rows.length === 1 ? "sale" : "sales"}`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 bg-app data-[side=right]:w-full data-[side=right]:sm:max-w-192">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="font-serif text-2xl2 font-medium">
            Export {kind === "sales" ? "sales" : "summary"}
          </SheetTitle>
          <SheetDescription className="text-sm2 text-subtle">
            {detail === "time"
              ? "Takings grouped by slice of time, charted and tabled."
              : kind === "sales"
                ? "Every matching sale, listed with a daily chart."
                : "Totals, best sellers and who sold what, with a daily chart."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="grid gap-2">
            <Label htmlFor="export-period" className={fieldLabel}>Period</Label>
            <Select value={period} onValueChange={value => setPeriod(value as Period)}>
              <SelectTrigger id="export-period" className={cn(fieldInput, "w-full")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map(p => (
                  <SelectItem key={p.key} value={p.key} className="text-md2">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period !== "custom" && (
              <span className="text-sm2 text-subtle">
                {from ? `${formatDay(from)} to ${formatDay(to)}` : "Everything ever recorded"}
              </span>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="export-detail" className={fieldLabel}>
              {kind === "sales" ? "How much detail" : "What to export"}
            </Label>
            <Select value={detail} onValueChange={value => chooseDetail(value as Shape)}>
              <SelectTrigger id="export-detail" className={cn(fieldInput, "w-full")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kind === "sales" ? (
                  <>
                    <SelectItem value="simple" className="text-md2">Simple: one list of sales</SelectItem>
                    <SelectItem value="detailed" className="text-md2">Detailed: split by day, with breakdowns</SelectItem>
                  </>
                ) : (
                  <SelectItem value="simple" className="text-md2">Summary: totals, best sellers, who sold what</SelectItem>
                )}
                <SelectItem value="time" className="text-md2">Time distribution: when the money comes in</SelectItem>
              </SelectContent>
            </Select>
            <p className="m-0 text-sm2 leading-[1.45] text-subtle">
              {detail === "detailed"
                ? "Adds a revenue breakdown, a profit breakdown, the time of every sale, and a subtotal for each day. Covers the whole shop."
                : detail === "time"
                  ? "A chart of takings across the range, then the same figures as a table. No individual sales."
                  : kind === "sales"
                    ? "The headline figures, the chart, and every sale, split by day."
                    : "The headline figures, a daily chart, the best sellers and a line per person."}
            </p>
          </div>

          {detail === "time" && (
            <div className="mt-5 grid gap-1.5">
              <Label htmlFor="export-grouping" className={fieldLabel}>Group by</Label>
              <Select value={grouping} onValueChange={value => setGrouping(value as Grouping)}>
                <SelectTrigger id="export-grouping" className={cn(fieldInput, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupings.map(g => (
                    <SelectItem key={g.key} value={g.key} className="text-md2">{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="m-0 text-sm2 leading-[1.45] text-subtle">
                {grouping === "hourOfDay" || grouping === "weekday"
                  ? "Every day in the range is folded together, so a quiet Tuesday and a busy one land in the same bar."
                  : "One bar per step through the range, quiet ones included."}
              </p>
            </div>
          )}

          {period === "custom" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.75">
                <Label htmlFor="export-from" className="text-xs2 text-subtle">From</Label>
                <Input id="export-from" type="date" value={customFrom} max={customTo || undefined}
                  onChange={e => setCustomFrom(e.target.value)} className={fieldInput} />
              </div>
              <div className="grid gap-1.75">
                <Label htmlFor="export-to" className="text-xs2 text-subtle">To</Label>
                <Input id="export-to" type="date" value={customTo} min={customFrom || undefined}
                  onChange={e => setCustomTo(e.target.value)} className={fieldInput} />
              </div>
            </div>
          )}

          {isAdmin && !wholeShop && (
            <div className="mt-5 grid gap-2">
              <Label htmlFor="export-person" className={fieldLabel}>Recorded by</Label>
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger id="export-person" className={cn(fieldInput, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-md2">Everyone</SelectItem>
                  {people.map(p => (
                    <SelectItem key={p.id} value={p.name} className="text-md2">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!wholeShop && (
          <div className="mt-5 grid gap-2">
            <Label htmlFor="export-product" className={fieldLabel}>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="export-product" className={cn(fieldInput, "w-full")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-md2">All products</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-md2">
                    {p.name} · {money(p.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {invalid && <p className="m-0 mt-4 text-sm2 text-neg">The start date is after the end date.</p>}
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-line">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 flex-1 text-md2">
            Cancel
          </Button>
          <Button
            onClick={() => void run()}
            disabled={busy || Boolean(invalid)}
            className="h-12 flex-1 gap-2.5 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
          >
            <FileDown className="size-4.5" aria-hidden="true" />
            {busy ? "Building…" : "Export PDF"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
