/**
 * XLSX export: one workbook with
 *   1. a readable price list (per month type: package × customer, net and gross per unit),
 *   2. every combination with all technical columns,
 *   3. the discounts behind each price (configured vs applied),
 *   4. the calculation chain, 5. the settings used, 6. the messages shown in the app.
 * Money is written as numbers (PLN) with currency formats, so Excel can sum and sort it.
 */
import ExcelJS from 'exceljs';
import type { Locale } from '../core/money';
import { monthDiscountBp, monthIds } from '../core/pricing';
import { type Rat, mul, rat, roundHalf } from '../core/rational';
import { type Config, type Issue, type PriceList, type PriceRow, type RowStatus, SALE } from '../core/types';

export type Translate = (key: string, params?: Record<string, string>) => string;

export interface XlsxContext {
  list: PriceList;
  config: Config;
  lang: Locale;
  t: Translate;
  productName: string;
  date: Date;
  /** Formats an issue for the "messages" sheet (same text as in the app). */
  issueText: (issue: Issue) => string;
  /** January … December in the UI language. */
  calendarMonthNames: string[];
}

const MONEY = '#,##0.00 "zł"';
const MONEY_PRECISE = '#,##0.0000 "zł"';
const PCT = '0.00%';
const MULT = '0.00000000';

const BRAND = 'FFD6A142';
const BRAND_LIGHT = 'FFFBF3E3';
const HEADER_FILL = 'FFF3E6CC';
const STATUS_FILL: Partial<Record<RowStatus, string>> = {
  anchor: 'FFDCE9FB',
  sale: 'FFF1E4F7',
  override: 'FFFFF4CC',
  error: 'FFFBDADA',
};
const ABOVE_MAX_FONT = 'FFD9480F';

/** grosze → PLN number (exact to 2 decimals). */
const pln = (gr: bigint) => Number(gr) / 100;
/** exact grosze → PLN number rounded to the grosz. */
const plnRat = (gr: Rat) => Number(roundHalf(gr)) / 100;
/** exact grosze → PLN number with 4 decimals (shows rounding). */
const plnPrecise = (gr: Rat) => Number(roundHalf(mul(gr, rat(100)))) / 10000;
/** fraction → number for a % format (4 significant decimals of percent). */
const frac = (r: Rat) => Number(roundHalf(mul(r, rat(1_000_000)))) / 1_000_000;
const mult = (r: Rat) => Number(roundHalf(mul(r, rat(100_000_000)))) / 100_000_000;
const bp = (v: number) => v / 10000;

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = solidFill(HEADER_FILL);
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND } } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function title(ws: ExcelJS.Worksheet, text: string, sub?: string) {
  const r = ws.addRow([text]);
  r.font = { bold: true, size: 15, color: { argb: 'FF7A5A1A' } };
  if (sub) ws.addRow([sub]).font = { italic: true, color: { argb: 'FF7F7F7F' } };
  ws.addRow([]);
}

export function monthName(ctx: XlsxContext, id: string): string {
  if (id === SALE) return ctx.t('months.sale');
  return ctx.config.months.find((m) => m.id === id)?.label[ctx.lang] ?? id;
}

function customerName(ctx: XlsxContext, id: string): string {
  return ctx.config.customers.find((c) => c.id === id)?.label[ctx.lang] ?? id;
}

function tierName(ctx: XlsxContext, qty: bigint): string {
  return qty === 1n ? ctx.t('matrix.single') : ctx.t('matrix.units', { qty: qty.toString() });
}

function statusText(ctx: XlsxContext, r: PriceRow): string {
  return ctx.t(`status.${r.status}`);
}

const yesNo = (ctx: XlsxContext, v: boolean) => (v ? ctx.t('common.yes') : ctx.t('common.no'));

// ---------------------------------------------------------------- 1. readable price list
function priceListSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { list, config, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.priceList'), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const day = ctx.date.toISOString().slice(0, 10);
  title(ws, ctx.productName ? `${t('xlsx.priceListTitle')}: ${ctx.productName}` : t('xlsx.priceListTitle'), `${t('xlsx.date')}: ${day}`);

  const facts: [string, number | string, string?][] = [
    [t('input.cost'), pln(list.input.costGr), MONEY],
    [t('input.qty'), Number(list.input.qty)],
    [t('summary.unitCost'), plnRat(list.unitCost), MONEY],
    [t('summary.floor'), plnRat(list.floor), MONEY],
    [t('summary.base'), pln(list.topPrice), MONEY],
  ];
  if (list.input.maxPriceGr !== undefined) facts.push([t('input.maxPrice'), pln(list.input.maxPriceGr), MONEY]);
  facts.push([t('flex.label'), list.flex.active || list.flex.saleActive ? t('flex.badge') : yesNo(ctx, false)]);
  for (const [label, value, fmt] of facts) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { color: { argb: 'FF595959' } };
    r.getCell(2).font = { bold: true };
    if (fmt) r.getCell(2).numFmt = fmt;
  }
  ws.addRow([]);
  ws.addRow([t('xlsx.priceListNote')]).font = { italic: true, color: { argb: 'FF7F7F7F' } };

  const customers = config.customers;
  const gap = customers.length + 2; // first column of the gross block
  const byKey = new Map(list.rows.map((r) => [r.key, r]));

  for (const month of monthIds(config)) {
    ws.addRow([]);
    const head = ws.addRow([monthName(ctx, month)]);
    head.font = { bold: true, size: 12 };
    head.getCell(1).fill = solidFill(BRAND_LIGHT);

    const groups: (string | null)[] = [t('xlsx.netPerUnit'), ...customers.map(() => null), null, t('xlsx.grossPerUnit')];
    ws.addRow(groups).font = { bold: true, color: { argb: 'FF7A5A1A' } };
    const header = ws.addRow([
      t('matrix.package'),
      ...customers.map((c) => c.label[ctx.lang]),
      null,
      t('matrix.package'),
      ...customers.map((c) => c.label[ctx.lang]),
    ]);
    styleHeader(header);
    header.getCell(gap).fill = { type: 'pattern', pattern: 'none' };
    header.getCell(gap).border = {};

    for (const tier of list.tiers) {
      const rows = customers.map((c) => byKey.get(`${tier.qty}|${c.id}|${month}`)!);
      const line = ws.addRow([
        tierName(ctx, tier.qty),
        ...rows.map((r) => pln(r.netUnit)),
        null,
        tierName(ctx, tier.qty),
        ...rows.map((r) => pln(r.grossUnit)),
      ]);
      line.getCell(1).font = { bold: true };
      line.getCell(gap + 1).font = { bold: true };
      rows.forEach((r, i) => {
        for (const col of [2 + i, gap + 2 + i]) {
          const cell = line.getCell(col);
          cell.numFmt = MONEY;
          const fill = STATUS_FILL[r.status];
          if (fill) cell.fill = solidFill(fill);
          if (r.aboveMax) cell.font = { bold: true, color: { argb: ABOVE_MAX_FONT } };
        }
      });
    }
  }

  ws.addRow([]);
  const legend = ws.addRow([t('status.legend')]);
  legend.font = { bold: true };
  for (const s of ['anchor', 'sale', 'override', 'error'] as const) {
    const r = ws.addRow([null, t(`status.${s}`)]);
    r.getCell(1).fill = solidFill(STATUS_FILL[s]!);
  }
  if (list.input.maxPriceGr !== undefined) {
    ws.addRow([null, t('status.aboveMax')]).getCell(2).font = { bold: true, color: { argb: ABOVE_MAX_FONT } };
  }

  ws.getColumn(1).width = 28;
  for (let c = 2; c <= gap * 2; c++) ws.getColumn(c).width = 14;
  ws.getColumn(gap).width = 3;
  ws.getColumn(gap + 1).width = 12;
}

// ---------------------------------------------------------------- 2. all combinations
function combinationsSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { list, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.combinations'), { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols: { key: string; width: number; fmt?: string; value: (r: PriceRow) => unknown }[] = [
    { key: 'columns.qty', width: 9, value: (r) => Number(r.qty) },
    { key: 'columns.customer', width: 14, value: (r) => customerName(ctx, r.customerId) },
    { key: 'columns.month', width: 16, value: (r) => monthName(ctx, r.month) },
    { key: 'columns.netUnit', width: 13, fmt: MONEY, value: (r) => pln(r.netUnit) },
    { key: 'columns.grossUnit', width: 13, fmt: MONEY, value: (r) => pln(r.grossUnit) },
    { key: 'columns.netTotal', width: 15, fmt: MONEY, value: (r) => pln(r.netTotal) },
    { key: 'columns.grossTotal', width: 15, fmt: MONEY, value: (r) => pln(r.grossTotal) },
    { key: 'xlsx.cols.grossNotDivisible', width: 14, value: (r) => yesNo(ctx, r.grossNotDivisible) },
    { key: 'xlsx.cols.multiplier', width: 13, fmt: MULT, value: (r) => mult(r.multiplier) },
    { key: 'columns.nominalDiscount', width: 11, fmt: PCT, value: (r) => frac(r.nominalDiscount) },
    { key: 'columns.effectiveDiscount', width: 13, fmt: PCT, value: (r) => frac(r.effectiveDiscount) },
    { key: 'columns.feeUnit', width: 12, fmt: MONEY, value: (r) => plnRat(r.feeUnit) },
    { key: 'columns.profitUnit', width: 12, fmt: MONEY, value: (r) => plnRat(r.profitUnit) },
    { key: 'columns.profitTotal', width: 14, fmt: MONEY, value: (r) => plnRat(r.profitTotal) },
    { key: 'columns.profitPct', width: 10, fmt: PCT, value: (r) => frac(r.profitPct) },
    { key: 'columns.status', width: 14, value: (r) => statusText(ctx, r) },
    { key: 'xlsx.cols.edited', width: 10, value: (r) => yesNo(ctx, r.overridden) },
    { key: 'xlsx.cols.stale', width: 13, value: (r) => yesNo(ctx, r.stale) },
    { key: 'xlsx.cols.aboveMax', width: 12, value: (r) => yesNo(ctx, r.aboveMax) },
    { key: 'xlsx.cols.flexed', width: 11, value: (r) => yesNo(ctx, r.flexed) },
    { key: 'xlsx.cols.shortfall', width: 13, fmt: MONEY, value: (r) => (r.shortfall ? plnRat(r.shortfall) : null) },
    { key: 'xlsx.cols.key', width: 18, value: (r) => r.key },
  ];
  styleHeader(ws.addRow(cols.map((c) => t(c.key))));
  for (const r of list.rows) {
    const line = ws.addRow(cols.map((c) => c.value(r)));
    cols.forEach((c, i) => c.fmt && (line.getCell(i + 1).numFmt = c.fmt));
    const fill = STATUS_FILL[r.status];
    if (fill) line.getCell(cols.findIndex((c) => c.key === 'columns.status') + 1).fill = solidFill(fill);
  }
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

// ---------------------------------------------------------------- 3. discounts
function discountsSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { list, config, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.discounts'), { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.addRow([t('xlsx.discountsNote')]).font = { italic: true, color: { argb: 'FF7F7F7F' } };
  ws.addRow([]);
  styleHeader(
    ws.addRow([
      t('columns.qty'),
      t('columns.customer'),
      t('columns.month'),
      t('xlsx.cols.tierDiscount'),
      t('xlsx.cols.customerDiscount'),
      t('xlsx.cols.monthDiscount'),
      t('xlsx.cols.nominalTotal'),
      t('xlsx.cols.applied'),
      t('xlsx.cols.difference'),
      t('columns.netUnit'),
      t('xlsx.cols.flexed'),
    ]),
  );
  const tierBp = new Map(list.tiers.map((tier) => [tier.qty, tier.discountBp]));
  for (const r of list.rows) {
    const cust = config.customers.find((c) => c.id === r.customerId)!;
    const line = ws.addRow([
      Number(r.qty),
      cust.label[ctx.lang],
      monthName(ctx, r.month),
      bp(tierBp.get(r.qty) ?? 0),
      bp(cust.discountBp),
      r.month === SALE ? '—' : bp(monthDiscountBp(config, r.month)),
      frac(r.nominalDiscount),
      frac(r.effectiveDiscount),
      frac(r.nominalDiscount) - frac(r.effectiveDiscount),
      pln(r.netUnit),
      yesNo(ctx, r.flexed),
    ]);
    for (const col of [4, 5, 6, 7, 8, 9]) line.getCell(col).numFmt = PCT;
    line.getCell(10).numFmt = MONEY;
    if (r.flexed) line.getCell(8).fill = solidFill('FFDDF4EA');
  }
  [9, 14, 16, 14, 14, 14, 16, 16, 12, 13, 11].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 11 } };
}

// ---------------------------------------------------------------- 4. calculation chain
function calculationSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { list, config, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.calculation'));
  title(ws, t('xlsx.sheets.calculation'));
  styleHeader(ws.addRow([t('xlsx.cols.step'), t('xlsx.cols.value')]));
  const deepCustomer = customerName(ctx, list.deepest.customerId);
  const steps: [string, number | string, string?][] = [
    [t('breakdown.purchaseCost'), pln(list.input.costGr), MONEY],
    [t('breakdown.handlingPercent', { pct: `${config.handling.percentBp / 100} %` }), plnRat(list.handlingPercent), MONEY],
    [
      t('breakdown.fixedHandling', { total: `${(config.handling.fixedGr / 100).toFixed(2)} zł`, qty: list.input.qty.toString() }),
      pln(list.fixedPerUnit),
      MONEY,
    ],
    [t('xlsx.calc.fixedExact'), plnPrecise(list.fixedPerUnitExact), MONEY_PRECISE],
    [t('breakdown.unitCost'), plnPrecise(list.unitCost), MONEY_PRECISE],
    [
      t('breakdown.minProfit', {
        pct: `${config.minProfit.percentBp / 100} %`,
        fixed: `${(config.minProfit.fixedGr / 100).toFixed(2)} zł`,
      }),
      plnPrecise(list.minProfit),
      MONEY_PRECISE,
    ],
    [t('xlsx.calc.feeRate'), frac(list.fees.rate), PCT],
    [t('breakdown.floor'), plnPrecise(list.floor), MONEY_PRECISE],
    [
      t('breakdown.deepMultiplier', {
        qty: list.deepest.tier.qty.toString(),
        customer: deepCustomer,
        month: monthName(ctx, list.deepest.month),
      }),
      mult(list.deepest.multiplier),
      MULT,
    ],
    [t('breakdown.baseExact'), plnPrecise(list.baseExact), MONEY_PRECISE],
    [t(list.baseOverridden ? 'breakdown.baseOverride' : 'breakdown.base'), pln(list.base), MONEY],
  ];
  if (list.input.maxPriceGr !== undefined) steps.push([t('input.maxPrice'), pln(list.input.maxPriceGr), MONEY]);
  steps.push([t('flex.label'), list.flex.active ? t('flex.badge') : yesNo(ctx, false)]);
  if (list.flex.active) steps.push([t('breakdown.flexTop'), pln(list.topPrice), MONEY]);
  steps.push(
    [t('breakdown.saleFactor'), bp(config.sale.factorBp), PCT],
    [t('breakdown.saleCost'), plnPrecise(list.sale.cost), MONEY_PRECISE],
    [t('breakdown.saleDeepMultiplier'), mult(list.sale.deepMultiplier), MULT],
    [t('breakdown.saleBaseExact'), plnPrecise(list.sale.baseExact), MONEY_PRECISE],
    [t(list.sale.baseOverridden ? 'breakdown.saleBaseOverride' : 'breakdown.saleBase'), pln(list.sale.base), MONEY],
    [t('summary.retailProfit'), frac(list.retailProfitPct), PCT],
  );
  for (const [label, value, fmt] of steps) {
    const r = ws.addRow([label, value]);
    if (fmt) r.getCell(2).numFmt = fmt;
  }
  ws.getColumn(1).width = 70;
  ws.getColumn(2).width = 18;
}

// ---------------------------------------------------------------- 5. settings
function settingsSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { config, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.settings'));
  title(ws, t('xlsx.sheets.settings'));
  const section = (name: string) => {
    ws.addRow([]);
    ws.addRow([name]).font = { bold: true, size: 12 };
  };
  section(t('settings.costs'));
  const costs: [string, number, string][] = [
    [t('settings.handlingPercent'), bp(config.handling.percentBp), PCT],
    [t('settings.handlingFixed'), config.handling.fixedGr / 100, MONEY],
    [t('settings.minProfitPercent'), bp(config.minProfit.percentBp), PCT],
    [t('settings.minProfitFixed'), config.minProfit.fixedGr / 100, MONEY],
    [t('settings.vat'), bp(config.vatBp), PCT],
    [t('settings.fees'), bp(config.fees.percentBp), PCT],
    [t('settings.saleFactor'), bp(config.sale.factorBp), PCT],
  ];
  for (const [label, value, fmt] of costs) ws.addRow([label, value]).getCell(2).numFmt = fmt;

  section(t('settings.packages'));
  styleHeader(ws.addRow([t('settings.packageQty'), t('settings.discount')]));
  for (const p of [...config.packages].sort((a, b) => a.qty - b.qty)) {
    ws.addRow([p.qty, bp(p.discountBp)]).getCell(2).numFmt = PCT;
  }

  for (const [kind, name] of [
    ['customers', t('settings.customers')],
    ['months', t('settings.months')],
  ] as const) {
    section(name);
    styleHeader(ws.addRow([t('settings.labelPl'), t('settings.labelEn'), t('settings.discount')]));
    for (const item of config[kind]) {
      ws.addRow([item.label.pl, item.label.en, bp(item.discountBp)]).getCell(3).numFmt = PCT;
    }
  }

  section(t('settings.calendar'));
  config.calendar.forEach((m, i) => ws.addRow([ctx.calendarMonthNames[i] ?? String(i + 1), monthName(ctx, m)]));

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 12;
}

// ---------------------------------------------------------------- 6. messages
function messagesSheet(wb: ExcelJS.Workbook, ctx: XlsxContext) {
  const { list, t } = ctx;
  const ws = wb.addWorksheet(t('xlsx.sheets.messages'));
  styleHeader(ws.addRow([t('xlsx.cols.level'), t('xlsx.cols.message')]));
  if (list.issues.length === 0) ws.addRow(['', t('xlsx.noMessages')]);
  const colors = { error: 'FFC92A2A', warning: 'FFD9480F', info: 'FF7A5A1A' } as const;
  for (const issue of list.issues) {
    const r = ws.addRow([t(`xlsx.levels.${issue.level}`), ctx.issueText(issue)]);
    r.getCell(1).font = { bold: true, color: { argb: colors[issue.level] } };
    r.getCell(2).alignment = { wrapText: true };
  }
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 110;
}

export function buildWorkbook(ctx: XlsxContext): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OTK Price Helper';
  wb.created = ctx.date;
  priceListSheet(wb, ctx);
  combinationsSheet(wb, ctx);
  discountsSheet(wb, ctx);
  calculationSheet(wb, ctx);
  settingsSheet(wb, ctx);
  messagesSheet(wb, ctx);
  return wb;
}

export async function priceListXlsx(ctx: XlsxContext): Promise<Uint8Array> {
  const buffer = await buildWorkbook(ctx).xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
