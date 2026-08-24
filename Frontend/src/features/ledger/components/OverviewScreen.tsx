import { useMemo, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { money } from "@/lib/format";
import { daysBetween, isSale, saleProfit, shiftDays, startOfMonth, totalOf, withinRange } from "@/lib/ledger";
import { useSalesByDay, useSalesByPerson, useSalesByProduct, useSalesSpan, useSalesTotals } from "@/features/ledger/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/features/ledger/types";

const th = "px-4 py-3 text-left text-xs2 font-bold tracking-[1.4px] text-subtle uppercase whitespace-nowrap";
const td = "px-4 py-3.5 text-md2 align-middle";

const ranges = ["today", "yesterday", "7 days", "30 days", "this month", "all time"] as const;
type Range = (typeof ranges)[number];

// Inclusive bounds for the picked range. Empty strings mean unbounded.
function boundsFor(range: Range, today: string): { from: string; to: string } {
  if (range === "all time") return { from: "", to: "" };
  if (range === "today") return { from: today, to: today };
  if (range === "yesterday") {
    const then = shiftDays(today, -1);
    return { from: then, to: then };
  }
  if (range === "this month") return { from: startOfMonth(today), to: today };
  return { from: shiftDays(today, range === "7 days" ? -6 : -29), to: today };
}

// The equally long window immediately before this one, which is what the deltas compare
// against. All time has nothing before it.
function previousBounds(from: string, to: string) {
  if (!from || !to) return null;
  const previousTo = shiftDays(from, -1);
  return { from: shiftDays(previousTo, -daysBetween(from, to)), to: previousTo };
}

// What the deltas are measured against, said plainly. Percentages are harder to read at
// a glance than "GH₵ 24.00 more than yesterday".
const comparedTo: Record<Range, string> = {
  today: "yesterday",
  yesterday: "the day before",
  "7 days": "the 7 days before",
  "30 days": "the 30 days before",
  "this month": "the days before",
  "all time": ""
};

// Axis ticks sit in a narrow gutter, so they drop the currency and the decimals.
const axisLabel = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));

const summarise = (rows: Transaction[]) => ({
  revenue: totalOf(rows, t => t.amount),
  profit: totalOf(rows, saleProfit),
  units: totalOf(rows, t => t.quantity),
  count: rows.length
});

export function OverviewScreen({ transactions }: { transactions: Transaction[] }) {
  const [range, setRange] = useState<Range>("today");
  // Fixed for the life of the screen, so every figure is measured against one "now".
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const sales = useMemo(() => transactions.filter(isSale), [transactions]);

  const { from, to } = boundsFor(range, today);
  const previous = previousBounds(from, to);
  const trendFrom = shiftDays(today, -13);

  // Every figure is a server-side rollup over the whole range. Summing what happens to be
  // loaded would report a page rather than a period.
  const totals = useSalesTotals(from, to);
  const priorTotals = useSalesTotals(previous?.from ?? "", previous?.to ?? "");
  const byDay = useSalesByDay(trendFrom, today);
  const byProduct = useSalesByProduct(from, to);
  const byPerson = useSalesByPerson(from, to);
  const span = useSalesSpan();

  // Used only when there is no backend to roll the figures up for us.
  const local = useMemo(() => {
    const rows = sales.filter(s => withinRange(s.date, from, to));
    const before = previous ? sales.filter(s => withinRange(s.date, previous.from, previous.to)) : null;

    // Per product, over the range.
    const products = new Map<string, { name: string; units: number; revenue: number; profit: number }>();
    for (const s of rows) {
      const row = products.get(s.item) ?? { name: s.item, units: 0, revenue: 0, profit: 0 };
      row.units += s.quantity;
      row.revenue += s.amount;
      row.profit += saleProfit(s);
      products.set(s.item, row);
    }

    // Per person, over the range. Sales predating accounts have no name on them.
    const people = new Map<string, { name: string; count: number; revenue: number }>();
    for (const s of rows) {
      const name = s.recordedBy ?? "Unattributed";
      const row = people.get(name) ?? { name, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += s.amount;
      people.set(name, row);
    }

    // The trend is deliberately its own fixed window, not the range: a one-bar chart for
    // "today" tells you nothing, and a 90-bar one is unreadable on a phone.
    const trend = Array.from({ length: 14 }, (_, i) => {
      const date = shiftDays(today, i - 13);
      return { date, revenue: totalOf(sales.filter(s => s.date === date), t => t.amount) };
    });

    const earliest = sales.reduce((min, s) => (min && min <= s.date ? min : s.date), "");

    return {
      now: summarise(rows),
      before: before ? summarise(before) : null,
      earliest,
      products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
      people: [...people.values()].sort((a, b) => b.revenue - a.revenue),
      trend
    };
  }, [sales, from, to, previous, today]);

  const remote = isSupabaseConfigured;
  const now = remote ? totals.data ?? { revenue: 0, profit: 0, units: 0, count: 0 } : local.now;
  const before = remote ? (previous ? priorTotals.data ?? null : null) : local.before;
  const products = remote ? byProduct.data ?? [] : local.products;
  const people = remote ? byPerson.data ?? [] : local.people;

  // Fourteen fixed buckets either way, so a day with no sales still gets its gap.
  const trend = remote
    ? Array.from({ length: 14 }, (_, i) => {
        const date = shiftDays(today, i - 13);
        return { date, revenue: byDay.data?.get(date) ?? 0 };
      })
    : local.trend;

  // How many days the range covers, so the daily average is honest. All time runs from
  // the first sale ever recorded.
  const earliest = remote ? span.data?.first ?? "" : local.earliest;
  const days = Math.max(
    from && to ? daysBetween(from, to) + 1 : earliest ? daysBetween(earliest, today) + 1 : 1,
    1
  );

  const against = comparedTo[range];
  const margin = now.revenue > 0 ? (now.profit / now.revenue) * 100 : 0;
  const perDay = now.revenue / days;
  const perSale = now.count > 0 ? now.revenue / now.count : 0;
  const peakRevenue = Math.max(...trend.map(d => d.revenue), 0);

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 flex flex-col justify-between gap-5 lg:mb-8 lg:flex-row lg:items-end">
        <div>
          <Eyebrow>Analytics</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            How the shop
            <br />
            <em className="font-medium text-accent">is doing.</em>
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {ranges.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => setRange(option)}
              className={cn(
                "rounded border px-3.5 py-2 text-sm2 whitespace-nowrap capitalize transition-colors",
                range === option
                  ? "border-brandtext bg-select text-brandtext shadow-[0_0_0_1px_var(--brandtext)_inset]"
                  : "border-line bg-field text-subtle hover:border-hover-line hover:text-ink"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(var(--stat-min),1fr))] gap-2 min-[431px]:gap-3">
        <Metric label="Revenue" value={money(now.revenue)} now={now.revenue} before={before?.revenue} against={against} accent />
        <Metric label="Profit" value={money(now.profit)} now={now.profit} before={before?.profit} against={against} note={`${margin.toFixed(0)}% margin`} />
        <Metric
          label="Sales"
          value={String(now.count)}
          now={now.count}
          before={before?.count}
          against={against}
          format={String}
          note={`${now.units} units sold`}
        />
        <Metric
          label="Average a day"
          value={money(perDay)}
          note={now.count > 0 ? `${money(perSale)} per sale` : "No sales yet"}
        />
      </section>

      <section className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_390px]">
        <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
          <div className="mb-5.5 flex items-start justify-between gap-3">
            <div>
              <p className="m-0 mb-1.25 text-xs2 font-bold tracking-[1.4px] text-subtle">LAST 14 DAYS</p>
              <h3 className="m-0 font-serif text-2xl2 font-medium">Revenue per day</h3>
            </div>
            <span className="text-xs2 whitespace-nowrap text-subtle">Peak {money(peakRevenue)}</span>
          </div>

          {peakRevenue === 0 ? (
            <p className="m-0 py-12 text-center text-md2 text-subtle">
              No sales in the last fortnight. Record one and it shows up here.
            </p>
          ) : (
            <div className="flex gap-2.5">
              <div className="flex h-40 shrink-0 flex-col justify-between text-right text-xs2 tabular-nums text-faint">
                {[1, 0.75, 0.5, 0.25, 0].map(step => (
                  <span key={step} className="leading-none">{axisLabel(peakRevenue * step)}</span>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                {/* Bars are direct children of a fixed-height row so their % heights resolve. */}
                <div className="relative flex h-40 items-end gap-1 min-[431px]:gap-1.5">
                  {[0, 25, 50, 75, 100].map(at => (
                    <span
                      key={at}
                      aria-hidden="true"
                      style={{ bottom: `${at}%` }}
                      className="pointer-events-none absolute inset-x-0 border-t border-line-soft"
                    />
                  ))}
                  {trend.map(day => {
                    const height = Math.max((day.revenue / peakRevenue) * 100, day.revenue > 0 ? 3 : 0);
                    return (
                      <div
                        key={day.date}
                        title={`${day.date}: ${money(day.revenue)}`}
                        style={{ height: `${height}%` }}
                        className={cn(
                          "relative min-w-0 flex-1 rounded-t-[2px]",
                          day.revenue === 0 ? "min-h-0.5 bg-line" : day.date === today ? "bg-accent" : "bg-chart-bar"
                        )}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-1 min-[431px]:gap-1.5">
                  {trend.map(day => (
                    <span
                      key={day.date}
                      className={cn(
                        "min-w-0 flex-1 text-center text-xs2 tabular-nums",
                        day.date === today ? "font-bold text-accent" : "text-faint"
                      )}
                    >
                      {Number(day.date.slice(8, 10))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
          <div className="mb-5.5">
            <p className="m-0 mb-1.25 text-xs2 font-bold tracking-[1.4px] text-subtle">WHO RECORDED THEM</p>
            <h3 className="m-0 font-serif text-2xl2 font-medium">By person</h3>
          </div>
          {people.length === 0 ? (
            <p className="m-0 py-8 text-center text-md2 text-subtle">Nothing in this range.</p>
          ) : (
            people.map(person => (
              <div key={person.name} className="flex items-center justify-between gap-3 border-t border-line-soft py-3.5 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <strong className="block truncate text-md2 font-semibold">{person.name}</strong>
                  <small className="text-sm2 text-subtle">
                    {person.count} {person.count === 1 ? "sale" : "sales"}
                  </small>
                </div>
                <strong className="font-serif text-lg2 whitespace-nowrap">{money(person.revenue)}</strong>
              </div>
            ))
          )}
        </Card>
      </section>

      <Card className="mt-4 gap-0 overflow-hidden rounded-none border-line bg-panel p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-4 min-[431px]:px-6">
          <h3 className="m-0 font-serif text-2xl2 font-medium">Best sellers</h3>
          <span className="text-xs2 whitespace-nowrap text-subtle">{products.length} products sold</span>
        </div>

        {products.length === 0 ? (
          <p className="m-0 px-4.5 py-12 text-center text-md2 text-subtle min-[431px]:px-6">
            No sales in this range. Try a wider one.
          </p>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-band">
                  <th className={cn(th, "w-12 text-right")}>#</th>
                  <th className={th}>Product</th>
                  <th className={cn(th, "text-right")}>Units</th>
                  <th className={cn(th, "text-right")}>Revenue</th>
                  <th className={cn(th, "text-right")}>Profit</th>
                  <th className={cn(th, "min-w-45")}>Share of revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <tr key={product.name} className="border-b border-line-soft last:border-b-0">
                    <td className={cn(td, "text-right text-sm2 tabular-nums text-faint")}>{index + 1}</td>
                    <td className={cn(td, "min-w-45 font-semibold")}>{product.name}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{product.units}</td>
                    <td className={cn(td, "text-right font-serif whitespace-nowrap")}>{money(product.revenue)}</td>
                    <td className={cn(td, "text-right font-serif whitespace-nowrap", product.profit > 0 ? "text-pos" : "text-subtle")}>
                      {money(product.profit)}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-full min-w-20 rounded-full bg-band">
                          <div
                            className="h-full rounded-full bg-chart-bar"
                            style={{ width: `${now.revenue > 0 ? (product.revenue / now.revenue) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-sm2 tabular-nums text-subtle">
                          {now.revenue > 0 ? Math.round((product.revenue / now.revenue) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// A stat with its change against the previous equal-length window, stated as an amount
// rather than a percentage.
function Metric({
  label, value, note, now, before, against, format = money, accent = false
}: {
  label: string;
  value: string;
  note?: string;
  now?: number;
  before?: number | null;
  against?: string;
  format?: (value: number) => string;
  accent?: boolean;
}) {
  const delta = typeof now === "number" && typeof before === "number" && against ? now - before : null;
  const Icon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const tone = accent ? "text-on-deep-subtle" : delta && delta > 0 ? "text-pos" : delta && delta < 0 ? "text-neg" : "text-faint";
  const change =
    delta === null ? null
    : delta === 0 ? `Same as ${against}`
    : `${format(Math.abs(delta))} ${delta > 0 ? "more" : "less"} than ${against}`;

  return (
    <Card
      className={cn(
        "flex min-w-0 flex-col gap-0 rounded-none border-line p-4 shadow-none min-[431px]:p-5",
        accent ? "border-deep-2 bg-deep-2 text-white" : "bg-panel"
      )}
    >
      <span className={cn("text-xs2", accent ? "text-on-deep-subtle" : "text-subtle")}>{label}</span>
      <strong className="my-[7px] mt-4 font-serif text-[clamp(20px,3.2vw,30px)] whitespace-nowrap">{value}</strong>
      <span className="flex min-w-0 flex-col gap-0.5">
        {change && (
          <span className={cn("flex items-start gap-1.5 text-xs2 leading-snug", tone)}>
            <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{change}</span>
          </span>
        )}
        {note && <span className={cn("truncate text-xs2", accent ? "text-on-deep-subtle" : "text-faint")}>{note}</span>}
      </span>
    </Card>
  );
}

