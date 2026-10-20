/**
 * CSV export (SPEC.md §10). Default dialect targets Polish Excel:
 * UTF-8 with BOM, ";" separator, decimal comma, CRLF line endings.
 */
import { formatScaled } from './money';
import { type Rat, mul, rat, roundHalf } from './rational';
import type { PriceList, PriceRow } from './types';

export interface CsvDialect {
  separator: ';' | ',';
  decimalSep: ',' | '.';
}

export const POLISH_EXCEL: CsvDialect = { separator: ';', decimalSep: ',' };
export const INTERNATIONAL: CsvDialect = { separator: ',', decimalSep: '.' };

const BOM = '﻿';

function quote(cell: string, separator: string): string {
  return cell.includes(separator) || /["\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(table: readonly (readonly string[])[], separator: string): string {
  return BOM + table.map((row) => row.map((cell) => quote(cell, separator)).join(separator)).join('\r\n') + '\r\n';
}

/** Minimal RFC 4180 parser (used for round-trip tests and re-import checks). */
export function parseCsv(text: string, separator: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === separator) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export const CSV_COLUMNS = [
  'qty',
  'customer',
  'month',
  'netUnit',
  'grossUnit',
  'netTotal',
  'grossTotal',
  'profitUnit',
  'profitTotal',
  'profitPct',
  'nominalDiscount',
  'effectiveDiscount',
  'status',
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvLabels {
  header: (column: CsvColumn) => string;
  customer: (id: string) => string;
  month: (month: PriceRow['month']) => string;
  status: (row: PriceRow) => string;
}

export function priceListTable(list: PriceList, labels: CsvLabels, dialect: CsvDialect): string[][] {
  const money = (gr: bigint) => formatScaled(gr, 2, { decimalSep: dialect.decimalSep });
  const moneyRat = (gr: Rat) => money(roundHalf(gr));
  const pct = (f: Rat) => formatScaled(roundHalf(mul(f, rat(10000))), 2, { decimalSep: dialect.decimalSep });
  return [
    CSV_COLUMNS.map(labels.header),
    ...list.rows.map((r) => [
      r.qty.toString(),
      labels.customer(r.customerId),
      labels.month(r.month),
      money(r.netUnit),
      money(r.grossUnit),
      money(r.netTotal),
      money(r.grossTotal),
      moneyRat(r.profitUnit),
      moneyRat(r.profitTotal),
      pct(r.profitPct),
      pct(r.nominalDiscount),
      pct(r.effectiveDiscount),
      labels.status(r),
    ]),
  ];
}

export function priceListCsv(list: PriceList, labels: CsvLabels, dialect: CsvDialect = POLISH_EXCEL): string {
  return toCsv(priceListTable(list, labels, dialect), dialect.separator);
}
