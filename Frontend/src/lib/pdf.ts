import { money } from "@/lib/format";
import { formatDay, saleProfit, shiftDays } from "@/lib/ledger";
import type { Product, Transaction } from "@/features/ledger/types";

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
  // The catalogue, so the detailed breakdowns can list what did not sell as well as what did.
  products?: Product[];
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

// A running tally, used for every breakdown in the report.
const blank = () => ({ revenue: 0, profit: 0, units: 0, count: 0 });
type Tally = ReturnType<typeof blank>;

function tallyBy(rows: Transaction[], keyOf: (row: Transaction) => string) {
  const map = new Map<string, Tally>();
  for (const row of rows) {
    const key = keyOf(row);
    const tally = map.get(key) ?? blank();
    tally.revenue += row.amount;
    tally.profit += saleProfit(row);
    tally.units += row.quantity;
    tally.count += 1;
    map.set(key, tally);
  }
  return map;
}

const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");
const marginOf = (t: Tally) => (t.revenue > 0 ? `${Math.round((t.profit / t.revenue) * 100)}%` : "0%");

type AutoTable = (typeof import("jspdf-autotable"))["default"];

// A titled table. Returns the y it ended at, so the next one can follow.
function section(
  doc: Doc, autoTable: AutoTable, margin: number,
  title: string, head: string[], body: string[][], startY: number, rightFrom: number
) {
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
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: ink, lineColor: rule, lineWidth: 0.5 },
    headStyles: { fillColor: "#14312f", textColor: "#ffffff", fontSize: 8 },
    alternateRowStyles: { fillColor: "#f6f4ef" },
    columnStyles: aligned
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// Stamped once at the end, when the page count is finally known. Doing this from autoTable's
// didDrawPage prints "Page 2 of 2" on every page, because the total is still growing.
function paginate(doc: Doc, width: number, margin: number) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(`Page ${page} of ${total}`, width - margin, doc.internal.pageSize.getHeight() - 24, { align: "right" });
  }
}

// The short report: the headline figures, the chart, and one flat list of sales. jsPDF is ~350KB,
// which is most of the app again, so it is imported here rather than at the top of the module:
// the download only costs anything for someone who exports.
export async function downloadSimpleSalesReport(report: SalesReport) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  const admin = report.isAdmin;

  header(doc, width, margin, "Sales report", report.from, report.to, report.by, report.scope);

  // Totals come from the server rollup, so they describe the range even though the
  // screen that launched this only had 20 rows on it.
  const marginPct = report.totals.revenue > 0 ? (report.totals.profit / report.totals.revenue) * 100 : 0;
  summaryRow(doc, width, margin, 118, [
    ["Revenue", cash(report.totals.revenue)],
    ...(admin ? ([["Profit", `${cash(report.totals.profit)}  (${marginPct.toFixed(0)}%)`]] as [string, string][]) : []),
    ["Sales", String(report.totals.count)],
    ["Units", String(report.totals.units)]
  ]);

  const afterChart = drawChart(
    doc, perDaySeries(report.rows, report.from, report.to),
    margin, 166, width - margin * 2, 120, "Revenue per day"
  );

  // Split into days, the same way the detailed report does: a band opening each day and a
  // subtotal closing it. A long unbroken run of rows cannot be read a day at a time.
  const days = [...tallyBy(report.rows, row => row.date).entries()].sort(([a], [b]) => b.localeCompare(a));
  const head = ["Date", "Item", "By", "Qty", "Selling price", "Total sold", ...(admin ? ["Profit"] : [])];
  const bandStyles = { fillColor: "#e7ebe8", textColor: ink, fontStyle: "bold" as const, fontSize: 9, cellPadding: 6 };
  const footStyles = { fillColor: "#f6f4ef", fontStyle: "bold" as const };
  const right = { halign: "right" as const };

  const body: unknown[][] = [];
  for (const [date, t] of days) {
    body.push([{
      content: `${formatDay(date)}      ${t.count} ${t.count === 1 ? "sale" : "sales"}  \u00b7  ${t.units} units  \u00b7  ${cash(t.revenue)}` +
        (admin ? `  \u00b7  ${cash(t.profit)} profit` : ""),
      colSpan: head.length,
      styles: bandStyles
    }]);
    for (const row of report.rows.filter(r => r.date === date)) {
      body.push([
        `${formatDay(row.date)}\n${row.time}`,
        // The note rides under the item rather than taking a column of its own, which would
        // be empty on most rows and squeeze everything else.
        row.note ? `${row.item}\n${row.note}` : row.item,
        row.recordedBy ?? "\u2014",
        String(row.quantity),
        cash(row.unitPrice),
        cash(row.amount),
        ...(admin ? [cash(saleProfit(row))] : [])
      ]);
    }
    body.push([
      { content: `${formatDay(date)} total`, colSpan: 3, styles: footStyles },
      { content: String(t.units), styles: { ...footStyles, ...right } },
      { content: "", styles: footStyles },
      { content: cash(t.revenue), styles: { ...footStyles, ...right } },
      ...(admin ? [{ content: cash(t.profit), styles: { ...footStyles, ...right } }] : [])
    ]);
  }

  autoTable(doc, {
    head: [head],
    body: body as string[][],
    startY: afterChart + 12,
    margin: { left: margin, right: margin, bottom: 48 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: ink, lineColor: rule, lineWidth: 0.5 },
    headStyles: { fillColor: "#14312f", textColor: "#ffffff", fontSize: 8 },
    // A sale split down the middle by a page break is unreadable, and its figures end up on
    // the page that does not carry its date.
    rowPageBreak: "avoid",
    columnStyles: admin
      ? { 0: { cellWidth: 64 }, 2: { cellWidth: 38 }, 3: { cellWidth: 24, ...right }, 4: { cellWidth: 64, ...right },
          5: { cellWidth: 64, ...right }, 6: { cellWidth: 54, ...right } }
      : { 0: { cellWidth: 64 }, 2: { cellWidth: 46 }, 3: { cellWidth: 28, ...right }, 4: { cellWidth: 68, ...right },
          5: { cellWidth: 68, ...right } }
  });

  paginate(doc, width, margin);
  doc.save(`dawfuzy-sales-${fileSafe(report.from, report.to)}.pdf`);
}

// Builds the detailed sales report and hands it to the browser to save. jsPDF is ~350KB, which is most of
// the app again, so it is imported here rather than at the top of the module: the download only
// costs anything for someone who exports.
export async function downloadDetailedSalesReport(report: SalesReport) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  const admin = report.isAdmin;

  header(doc, width, margin, "Sales report", report.from, report.to, report.by, report.scope);

  const series = perDaySeries(report.rows, report.from, report.to);
  const trading = series.filter(d => d.revenue > 0).length;
  const perTradingDay = trading > 0 ? report.totals.revenue / trading : 0;

  // Totals come from the server rollup, so they describe the range even though the
  // screen that launched this only had 20 rows on it.
  const marginPct = report.totals.revenue > 0 ? (report.totals.profit / report.totals.revenue) * 100 : 0;
  summaryRow(doc, width, margin, 118, [
    ["Revenue", cash(report.totals.revenue)],
    ...(admin ? ([["Profit", `${cash(report.totals.profit)}  (${marginPct.toFixed(0)}%)`]] as [string, string][]) : []),
    ["Sales", String(report.totals.count)],
    ["Units", String(report.totals.units)]
  ]);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(muted);
  doc.text(
    `${trading} ${trading === 1 ? "day" : "days"} with sales  \u00b7  ${cash(perTradingDay)} on a trading day  \u00b7  ` +
    `${report.rows.length} ${report.rows.length === 1 ? "row" : "rows"} listed`,
    margin, 154
  );

  const afterChart = drawChart(doc, series, margin, 176, width - margin * 2, 118, "Revenue per day");

  const byDay = tallyBy(report.rows, row => row.date);
  const byProduct = tallyBy(report.rows, row => row.item);
  const byPerson = tallyBy(report.rows, row => row.recordedBy ?? "Unattributed");

  // Everything still in the catalogue is listed, sold or not: a line that moved nothing is
  // exactly what this page is worth reading for. Retired products only appear if they sold.
  for (const product of report.products ?? []) {
    if (!product.retiredAt && !byProduct.has(product.name)) byProduct.set(product.name, blank());
  }
  const ranked = (map: Map<string, Tally>, key: "revenue" | "profit") =>
    [...map.entries()].sort((a, b) => b[1][key] - a[1][key]);
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));

  section(doc, autoTable, margin, "Revenue by day",
    ["Date", "Sales", "Units", "Revenue", ...(admin ? ["Profit"] : []), "Share"],
    days.map(([date, t]) => [
      formatDay(date), String(t.count), String(t.units), cash(t.revenue),
      ...(admin ? [cash(t.profit)] : []), share(t.revenue, report.totals.revenue)
    ]),
    afterChart + 20, 1);

  // Revenue breakdown, on its own page so it reads without the row list around it.
  doc.addPage();
  header(doc, width, margin, "Revenue breakdown", report.from, report.to, report.by, report.scope);

  let y = section(doc, autoTable, margin, "Revenue by product",
    ["Product", "Units", "Sales", "Revenue", "Share"],
    ranked(byProduct, "revenue").map(([name, t]) => [name, String(t.units), String(t.count), cash(t.revenue), share(t.revenue, report.totals.revenue)]),
    124, 1);

  section(doc, autoTable, margin, "Revenue by person",
    ["Person", "Sales", "Units", "Revenue", "Share"],
    ranked(byPerson, "revenue").map(([name, t]) => [name, String(t.count), String(t.units), cash(t.revenue), share(t.revenue, report.totals.revenue)]),
    y + 30, 1);

  // Profit breakdown. Cost is admin-only, so for anyone else this page would be all zeroes.
  if (admin) {
    doc.addPage();
    header(doc, width, margin, "Profit breakdown", report.from, report.to, report.by, report.scope);

    y = section(doc, autoTable, margin, "Profit by product",
      ["Product", "Units", "Revenue", "Cost price", "Profit", "Margin"],
      ranked(byProduct, "profit").map(([name, t]) =>
        [name, String(t.units), cash(t.revenue), cash(t.revenue - t.profit), cash(t.profit), marginOf(t)]),
      124, 1);

    // Naming this is the difference between a low margin and an unknown one.
    const noCost = [...byProduct.entries()].filter(([, t]) => t.profit === 0 && t.revenue > 0);
    if (noCost.length) {
      const unknown = noCost.reduce((n, [, t]) => n + t.revenue, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(muted);
      doc.text(
        `${noCost.length} ${noCost.length === 1 ? "product has" : "products have"} no buying price set, so they report no profit. ` +
        `That covers ${cash(unknown)} of revenue whose margin is unknown; the figures here are the profit on everything else.`,
        margin, y + 14, { maxWidth: width - margin * 2 }
      );
      y += 26;
    }

    y = section(doc, autoTable, margin, "Profit by person",
      ["Person", "Sales", "Revenue", "Profit", "Margin"],
      ranked(byPerson, "profit").map(([name, t]) => [name, String(t.count), cash(t.revenue), cash(t.profit), marginOf(t)]),
      y + 30, 1);

    section(doc, autoTable, margin, "Profit by day",
      ["Date", "Revenue", "Profit", "Margin"],
      days.map(([date, t]) => [formatDay(date), cash(t.revenue), cash(t.profit), marginOf(t)]),
      y + 30, 1);
  }

  // Every sale, split into days. A run of several hundred undifferentiated rows is unreadable,
  // and a day is the unit the shop actually counts in.
  doc.addPage();
  header(doc, width, margin, "Every sale", report.from, report.to, report.by, report.scope);

  const head = ["Date", "Item", "By", "Qty", "Selling price", ...(admin ? ["Cost price"] : []), "Total sold", ...(admin ? ["Profit"] : [])];
  const bandStyles = { fillColor: "#e7ebe8", textColor: ink, fontStyle: "bold" as const, fontSize: 9, cellPadding: 6 };
  const footStyles = { fillColor: "#f6f4ef", fontStyle: "bold" as const };
  const body: unknown[][] = [];
  for (const [date, t] of days) {
    body.push([{
      content: `${formatDay(date)}      ${t.count} ${t.count === 1 ? "sale" : "sales"}  \u00b7  ${t.units} units  \u00b7  ${cash(t.revenue)}` +
        (admin ? `  \u00b7  ${cash(t.profit)} profit` : ""),
      colSpan: head.length,
      styles: bandStyles
    }]);
    for (const row of report.rows.filter(r => r.date === date)) {
      body.push([
        `${formatDay(row.date)}\n${row.time}`,
        // The note rides under the item rather than taking a column of its own, which would
        // be empty on most rows and squeeze everything else.
        row.note ? `${row.item}\n${row.note}` : row.item,
        row.recordedBy ?? "\u2014",
        String(row.quantity),
        cash(row.unitPrice),
        ...(admin ? [cash(row.costPrice)] : []),
        cash(row.amount),
        ...(admin ? [cash(saleProfit(row))] : [])
      ]);
    }
    body.push([
      { content: `${formatDay(date)} total`, colSpan: 3, styles: footStyles },
      { content: String(t.units), styles: { ...footStyles, halign: "right" as const } },
      { content: "", colSpan: admin ? 2 : 1, styles: footStyles },
      { content: cash(t.revenue), styles: { ...footStyles, halign: "right" as const } },
      ...(admin ? [{ content: cash(t.profit), styles: { ...footStyles, halign: "right" as const } }] : [])
    ]);
  }

  const right = { halign: "right" as const };
  autoTable(doc, {
    head: [head],
    body: body as string[][],
    startY: 124,
    margin: { left: margin, right: margin, bottom: 48 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: ink, lineColor: rule, lineWidth: 0.5 },
    headStyles: { fillColor: "#14312f", textColor: "#ffffff", fontSize: 8 },
    // A sale split down the middle by a page break is unreadable, and its figures end up on
    // the page that does not carry its date.
    rowPageBreak: "avoid",
    // Widths are sized to hold "GH\u00a2 000.00" and "27 Sept 2026" on one line each. Letting
    // either wrap costs more height than the column saves.
    columnStyles: admin
      ? { 0: { cellWidth: 62 }, 2: { cellWidth: 32 }, 3: { cellWidth: 26, ...right }, 4: { cellWidth: 56, ...right },
          5: { cellWidth: 52, ...right }, 6: { cellWidth: 62, ...right }, 7: { cellWidth: 50, ...right } }
      : { 0: { cellWidth: 64 }, 2: { cellWidth: 42 }, 3: { cellWidth: 26, ...right }, 4: { cellWidth: 64, ...right },
          5: { cellWidth: 68, ...right } }
  });

  paginate(doc, width, margin);
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
      ...(report.isAdmin ? ["Cost price"] : []),
      "Selling price",
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
