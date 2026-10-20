import { describe, expect, it } from 'vitest';
import { INTERNATIONAL, type CsvLabels, parseCsv, priceListCsv, toCsv } from '../../src/core/csv';
import { exportFileName, sanitizeFileName } from '../../src/core/filename';
import { input, list } from './helpers';

const labels: CsvLabels = {
  header: (c) => c,
  customer: (id) => id,
  month: (m) => m,
  status: (r) => r.status,
};

describe('csv', () => {
  it('writes Polish Excel dialect by default', () => {
    const csv = priceListCsv(list(input(1000, 1000)), labels);
    expect(csv.startsWith('﻿qty;customer;month;')).toBe(true);
    expect(csv).toContain('\r\n');
    const rows = parseCsv(csv, ';');
    expect(rows).toHaveLength(126);
    const anchor = rows.find((r) => r[0] === '300' && r[1] === 'w4' && r[2] === 'pre3')!;
    expect(anchor).toEqual([
      '300', 'w4', 'pre3', '12,51', '15,39', '3753,00', '4616,19', '1,01', '303,00', '10,10', '44,62', '44,57', 'anchor',
    ]);
  });

  it('supports the international dialect', () => {
    const rows = parseCsv(priceListCsv(list(input(1000, 1000)), labels, INTERNATIONAL), ',');
    expect(rows[1]![3]).toBe('22.57');
  });

  it('quotes cells containing separators, quotes and newlines', () => {
    const csv = toCsv([['a;b', 'say "hi"', 'x\ny', 'plain']], ';');
    expect(csv).toBe('﻿"a;b";"say ""hi""";"x\ny";plain\r\n');
    expect(parseCsv(csv, ';')).toEqual([['a;b', 'say "hi"', 'x\ny', 'plain']]);
  });

  it('parses LF-only files and a last line without newline', () => {
    expect(parseCsv('a;b\nc;d', ';')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('filenames', () => {
  it('strips characters Windows forbids', () => {
    expect(sanitizeFileName('A/B: "test"?', 'product')).toBe('A_B_test');
    expect(sanitizeFileName('  Kubek 330 ml  ', 'product')).toBe('Kubek_330_ml');
  });

  it('falls back for empty and reserved names', () => {
    expect(sanitizeFileName('???', 'produkt')).toBe('produkt');
    expect(sanitizeFileName('CON', 'product')).toBe('_CON');
  });

  it('limits the length', () => {
    expect(sanitizeFileName('x'.repeat(300), 'p')).toHaveLength(100);
  });

  it('builds the export name with the local date', () => {
    expect(exportFileName('Kubek', new Date(2026, 9, 5), 'p')).toBe('Kubek_2026-10-05.csv');
  });
});
