import { describe, expect, it } from 'vitest';
import { exportFileName, sanitizeFileName } from '../../src/core/filename';

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
    expect(exportFileName('Kubek', new Date(2026, 9, 5), 'p')).toBe('Kubek_2026-10-05.xlsx');
  });
});

describe('export file extension', () => {
  it('can use another extension', () => {
    expect(exportFileName('Kubek', new Date(2026, 9, 5), 'p', 'json')).toBe('Kubek_2026-10-05.json');
  });
});
