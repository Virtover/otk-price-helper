import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { calculate } from '../../src/core/pricing';
import { type XlsxContext, priceListXlsx } from '../../src/export/xlsx';
import pl from '../../src/i18n/pl.json';
import { config, input, list } from './helpers';

/** Minimal translator over pl.json with {{param}} interpolation. */
const t = (key: string, params: Record<string, string> = {}) => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], pl);
  if (typeof value !== 'string') throw new Error(`missing translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, p: string) => params[p] ?? '');
};

function ctx(l = list(input(1000, 1000)), cfg = config()): XlsxContext {
  return {
    list: l,
    config: cfg,
    lang: 'pl',
    t,
    productName: 'Kubek 330 ml',
    date: new Date('2026-10-21T10:00:00Z'),
    issueText: (i) => i.code,
    calendarMonthNames: pl.months.names,
  };
}

async function read(c: XlsxContext) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await priceListXlsx(c)).buffer as ArrayBuffer);
  return wb;
}

const rowNumberOf = (ws: ExcelJS.Worksheet, first: unknown) => {
  let found = 0;
  ws.eachRow((r, n) => {
    if (!found && (r.values as unknown[])[1] === first) found = n;
  });
  return found;
};

const cellsOf = (ws: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  ws.eachRow((r) => out.push((r.values as unknown[]).slice(1)));
  return out;
};

describe('xlsx export', () => {
  it('has the six sheets in order', async () => {
    const wb = await read(ctx());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Cennik',
      'Wszystkie kombinacje',
      'Rabaty',
      'Obliczenia',
      'Ustawienia',
      'Uwagi',
    ]);
  });

  it('writes a readable price list with prices as numbers', async () => {
    const ws = (await read(ctx())).getWorksheet('Cennik')!;
    const rows = cellsOf(ws);
    expect(rows[0]![0]).toBe('Cennik: Kubek 330 ml');
    // section for the deepest month, row for 300 pcs: net hurt 4 = 12,51, gross hurt 4 = 15,39
    const sectionStart = rows.findIndex((r) => r[0] === 'Przedszczyt 3');
    const line = rows.slice(sectionStart).find((r) => r[0] === '300 szt.')!;
    expect(line.slice(1, 6)).toEqual([14.54, 13.81, 13.38, 12.94, 12.51]);
    expect(line[line.length - 1]).toBe(15.39);
    let rowNumber = 0;
    ws.eachRow((r, n) => {
      const v = (r.values as unknown[]).slice(1);
      if (n > rowNumberOf(ws, 'Przedszczyt 3') && v[0] === '300 szt.' && !rowNumber) rowNumber = n;
    });
    expect(ws.getRow(rowNumber).getCell(6).numFmt).toContain('zł');
  });

  it('lists every combination with technical columns', async () => {
    const ws = (await read(ctx())).getWorksheet('Wszystkie kombinacje')!;
    const rows = cellsOf(ws);
    expect(rows).toHaveLength(1 + 125);
    expect(rows[0]).toContain('Mnożnik');
    const anchor = rows.find((r) => r[rows[0]!.indexOf('Klucz')] === '300|w4|pre3')!;
    expect(anchor[3]).toBe(12.51);
    expect(anchor[rows[0]!.indexOf('Status')]).toBe('kotwica');
    expect(ws.autoFilter).toBeTruthy();
  });

  it('shows configured and applied discounts', async () => {
    const ws = (await read(ctx())).getWorksheet('Rabaty')!;
    const rows = cellsOf(ws);
    const line = rows.find((r) => r[0] === 300 && r[1] === 'hurt 4' && r[2] === 'Przedszczyt 3')!;
    expect(line.slice(3, 7)).toEqual([0.08, 0.14, 0.3, 0.44616]);
    const sale = rows.find((r) => r[2] === 'Wyprzedaż')!;
    expect(sale[5]).toBe('—');
  });

  it('marks flexed prices and the flexible mode', async () => {
    const r = calculate({ ...input(1000, 1000), maxPriceGr: 2000n }, config(), { rows: {} }, { flexible: true });
    if (!r.ok) throw new Error('failed');
    const wb = await read(ctx(r.list));
    const discounts = cellsOf(wb.getWorksheet('Rabaty')!);
    expect(discounts.some((row) => row[10] === 'Tak')).toBe(true);
    const facts = cellsOf(wb.getWorksheet('Cennik')!);
    expect(facts.find((row) => row[0] === 'Elastyczny cennik')![1]).toBe('elastyczny');
  });

  it('documents the calculation, settings and messages', async () => {
    const wb = await read(ctx());
    const calc = cellsOf(wb.getWorksheet('Obliczenia')!);
    expect(calc.find((r) => r[0] === '= cena minimalna')![1]).toBe(12.5);
    const settings = cellsOf(wb.getWorksheet('Ustawienia')!);
    expect(settings.find((r) => r[0] === 'Grudzień')![1]).toBe('Szczyt');
    expect(settings.find((r) => r[0] === 'Prowizje %')![1]).toBe(0);
    const messages = cellsOf(wb.getWorksheet('Uwagi')!);
    expect(messages[1]).toEqual(['Informacja', 'retailProfitHigh']);
  });
});
