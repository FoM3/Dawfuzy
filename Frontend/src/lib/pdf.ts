import { money } from "@/lib/format";
import { formatDay, saleProfit, shiftDays } from "@/lib/ledger";
import type { Transaction } from "@/features/ledger/types";

export type SalesReport = {
  rows: Transaction[];
  totals: { revenue: number; profit: number; units: number; count: number };
  from: string;
  to: string;
  isAdmin: boolean;
  by: string;
  // Any person or product this was narrowed to, printed so a filtered report cannot be
  // mistaken for the whole shop.
  scope?: string[];
};

const ink = "#14312f";
const muted = "#6b7671";
const rule = "#d8dedb";

const rangeLabel = (from: string, to: string) => {
  if (!from && !to) return "All time";
  if (from === to) return formatDay(from);
  return `${from ? formatDay(from) : "the start"} to ${to ? formatDay(to) : "today"}`;
};

// jsPDF's built-in fonts are WinAnsi, which has no cedi sign (U+20B5) but does have the
// cent sign (U+00A2). Swapping the glyph keeps "GH¢" readable without embedding a whole
// TTF into the bundle for one character.
const cash = (value: number) => money(value).replace("₵", "¢");

const fileSafe = (from: string, to: string) =>
  !from && !to ? "all-time" : from === to ? from : `${from || "start"}_${to || "today"}`;

type Doc = import("jspdf").jsPDF;

// The brand mark, drawn rather than embedded. A circle and a letter carry the identity without
// shipping an image, and it cannot fail to load the way a fetched asset can.
function drawLogo(doc: Doc, x: number, y: number, size = 26) {
  const r = size / 2;
  doc.setFillColor(ink);
  doc.circle(x + r, y + r, r, "F");
  doc.setTextColor("#f6f4ef");
  doc.setFont("times", "bolditalic");
  doc.setFontSize(size * 0.62);
  doc.text("D", x + r, y + r + size * 0.22, { align: "center" });
  doc.setFont("helvetica", "normal");
}

// Shared page furniture, so both reports open the same way.
function header(
  doc: Doc, width: number, margin: number, kicker: string,
  from: string, to: string, by: string, scope: string[] = []
) {
  drawLogo(doc, margin, 32);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(ink);
  doc.text("Dawfuzy Water Ledger", margin + 36, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(muted);
  doc.text(`${kicker}  ·  ${rangeLabel(from, to)}`, margin + 36, 65);
  doc.setFontSize(8);
  const filtered = scope.length ? `  ·  ${scope.join(" · ")} only` : "";
  doc.text(
    `Prepared by ${by} on ${formatDay(new Date().toISOString().slice(0, 10))}${filtered}`,
    margin + 36,
    78
  );

  doc.setDrawColor(rule);
  doc.line(margin, 94, width - margin, 94);
}

// Summary figures across the top, evenly spaced.
function summaryRow(doc: Doc, width: number, margin: number, y: number, cells: [string, string][]) {
  const column = (width - margin * 2) / cells.length;
  let x = margin;
  for (const [label, value] of cells) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(ink);
    doc.text(value, x, y + 19);
    x += column;
  }
  doc.setFont("helvetica", "normal");
}

// A revenue-per-day bar chart drawn with plain rectangles. A charting library would be another
// dependency and a rasterised image; this stays vector and weighs nothing. Buckets are capped so
// a long range stays readable rather than becoming a comb.
function drawChart(
  doc: Doc,
  days: { date: string; revenue: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
  title: string
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(ink);
  doc.text(title, x, y);

  const plotTop = y + 14;
  const plotHeight = height - 28;
  const peak = Math.max(...days.map(d => d.revenue), 0);

  if (peak <= 0 || days.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted);
    doc.text("No sales in this period.", x, plotTop + 20);
    return y + 40;
  }

  // Gridlines with their values, so a bar can be read rather than just compared.
  doc.setFontSize(7);
  doc.setDrawColor(rule);
  doc.setLineWidth(0.4);
  const axisWidth = 34;
  for (const step of [0, 0.5, 1]) {
    const lineY = plotTop + plotHeight - plotHeight * step;
    doc.line(x + axisWidth, lineY, x + width, lineY);
    doc.setTextColor(muted);
    doc.text(
      peak * step >= 1000 ? `${((peak * step) / 1000).toFixed(1)}k` : String(Math.round(peak * step)),
      x + axisWidth - 4,
      lineY + 2,
      { align: "right" }
    );
  }

  const slot = (width - axisWidth) / days.length;
  const barWidth = Math.max(Math.min(slot * 0.62, 22), 1.5);
  days.forEach((day, i) => {
    const barHeight = (day.revenue / peak) * plotHeight;
    const bx = x + axisWidth + slot * i + (slot - barWidth) / 2;
    doc.setFillColor(day.revenue > 0 ? "#c98b63" : rule);
    doc.rect(bx, plotTop + plotHeight - barHeight, barWidth, Math.max(barHeight, 0.6), "F");
  });

  // Only label what will fit; crowded ticks are worse than none.
  const every = Math.ceil(days.length / 14);
  doc.setFontSize(6.5);
  doc.setTextColor(muted);
  days.forEach((day, i) => {
    if (i % every !== 0) return;
    doc.text(String(Number(day.date.slice(8, 10))), x + axisWidth + slot * i + slot / 2, plotTop + plotHeight + 11, {
      align: "center"
    });
  });

  return plotTop + plotHeight + 22;
}

// Revenue per calendar day across the range, gaps included so quiet days show.
function perDaySeries(rows: Transaction[], from: string, to: string) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.date, (totals.get(row.date) ?? 0) + row.amount);
  if (!from || !to) {
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({ date, revenue }));
  }
  const days: { date: string; revenue: number }[] = [];
  for (let d = from; d <= to; d = shiftDays(d, 1)) days.push({ date: d, revenue: totals.get(d) ?? 0 });
  return days;
}

// Builds the sales report and hands it to the browser to save. jsPDF is ~350KB, which is most of
// the app again, so it is imported here rather than at the top of the module: the download only
// costs anything for someone who exports.
export async function downloadSalesReport(report: SalesReport) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;

  header(doc, width, margin, "Sales report", report.from, report.to, report.by, report.scope);

  // Totals come from the server rollup, so they describe the range even though the
  // screen that launched this only had 20 rows on it.
  const marginPct = report.totals.revenue > 0 ? (report.totals.profit / report.totals.revenue) * 100 : 0;
  summaryRow(doc, width, margin, 118, [
    ["Revenue", cash(report.totals.revenue)],
    ...(report.isAdmin ? ([["Profit", `${cash(report.totals.profit)}  (${marginPct.toFixed(0)}%)`]] as [string, string][]) : []),
    ["Sales", String(report.totals.count)],
    ["Units", String(report.totals.units)]
  ]);

  const afterChart = drawChart(
    doc,
    perDaySeries(report.rows, report.from, report.to),
    margin,
    166,
    width - margin * 2,
    120,
    "Revenue per day"
  );

  const head = ["Date", "Item", "By", "Qty", "Unit", "Total", ...(report.isAdmin ? ["Profit"] : [])];
  const body = report.rows.map(row => [
    formatDay(row.date),
    row.item,
    row.recordedBy ?? "—",
    String(row.quantity),
    cash(row.unitPrice),
    cash(row.amount),
    ...(report.isAdmin ? [cash(saleProfit(row))] : [])
  ]);

  autoTable(doc, {
    head: [head],
    body,
    startY: afterChart + 12,
    margin: { left: margin, right: margin, bottom: 48 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: ink, lineColor: rule, lineWidth: 0.5 },
    headStyles: { fillColor: "#14312f", textColor: "#ffffff", fontSize: 8 },
    alternateRowStyles: { fillColor: "#f6f4ef" },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" }
    },
    // A multi-page report needs to say which page you are holding.
    didDrawPage: data => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(muted);
      doc.text(
        `Page ${data.pageNumber} of ${page}`,
        width - margin,
        doc.internal.pageSize.getHeight() - 24,
        { align: "right" }
      );
    }
  });

  doc.save(`dawfuzy-sales-${fileSafe(report.from, report.to)}.pdf`);
}

export type ProductLine = {
  name: string;
  units: number;
  revenue: number;
  profit: number;
  // The lowest and highest actually charged in the period, not the catalogue's price.
  sellLow: number;
  sellHigh: number;
  costLow: number;
  costHigh: number;
};

export type AnalyticsReport = {
  rows: Transaction[];
  totals: { revenue: number; profit: number; units: number; count: number };
  products: ProductLine[];
  people: { name: string; count: number; revenue: number }[];
  perDay: number;
  from: string;
  to: string;
  isAdmin: boolean;
  by: string;
  scope?: string[];
};

// The summary rather than the rows: what sold, who sold it, and what it made.
export async function downloadAnalyticsReport(report: AnalyticsReport) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;

  header(doc, width, margin, "Analytics", report.from, report.to, report.by, report.scope);

  const marginPct = report.totals.revenue > 0 ? (report.totals.profit / report.totals.revenue) * 100 : 0;
  summaryRow(doc, width, margin, 118, [
    ["Revenue", cash(report.totals.revenue)],
    ...(report.isAdmin ? ([["Profit", `${cash(report.totals.profit)}  (${marginPct.toFixed(0)}%)`]] as [string, string][]) : []),
    ["Sales", `${report.totals.count}  (${report.totals.units} units)`],
    ["Average a day", cash(report.perDay)]
  ]);

  const afterChart = drawChart(
    doc,
    perDaySeries(report.rows, report.from, report.to),
    margin,
    166,
    width - margin * 2,
    120,
    "Revenue per day"
  );

  const table = (title: string, head: string[], body: string[][], startY: number, rightFrom: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(ink);
    doc.text(title, margin, startY);
    doc.setFont("helvetica", "normal");
    const aligned: Record<number, { halign: "right" }> = {};
    for (let i = rightFrom; i < head.length; i++) aligned[i] = { halign: "right" };
    autoTable(doc, {
      head: [head],
      body,
      startY: startY + 10,
      margin: { left: margin, right: margin, bottom: 48 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: ink, lineColor: rule, lineWidth: 0.5 },
      headStyles: { fillColor: "#14312f", textColor: "#ffffff", fontSize: 8 },
      alternateRowStyles: { fillColor: "#f6f4ef" },
      columnStyles: aligned
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  // A range where the price moved during the period, a single figure where it held.
  const span = (low: number, high: number) => (low === high ? cash(low) : `${cash(low)}–${cash(high)}`);
  const priceMoved = report.products.some(p => p.sellLow !== p.sellHigh || p.costLow !== p.costHigh);

  const afterProducts = table(
    "Best sellers",
    [
      "Product",
      "Units",
      ...(report.isAdmin ? ["Cost"] : []),
      "Sold at",
      "Revenue",
      ...(report.isAdmin ? ["Profit"] : []),
      "Share"
    ],
    report.products.map(p => [
      p.name,
      String(p.units),
      ...(report.isAdmin ? [span(p.costLow, p.costHigh)] : []),
      span(p.sellLow, p.sellHigh),
      cash(p.revenue),
      ...(report.isAdmin ? [cash(p.profit)] : []),
      `${report.totals.revenue > 0 ? Math.round((p.revenue / report.totals.revenue) * 100) : 0}%`
    ]),
    afterChart + 16,
    1
  );

  let afterNote = afterProducts;
  if (priceMoved) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(muted);
    doc.text(
      "A range means the price changed during this period. Figures are what each sale was actually charged at, not today's catalogue price.",
      margin,
      afterProducts + 14,
      { maxWidth: width - margin * 2 }
    );
    afterNote = afterProducts + 24;
  }

  table(
    "By person",
    ["Person", "Sales", "Revenue"],
    report.people.map(p => [p.name, String(p.count), cash(p.revenue)]),
    afterNote + 34,
    1
  );

  doc.save(`dawfuzy-analytics-${fileSafe(report.from, report.to)}.pdf`);
}
