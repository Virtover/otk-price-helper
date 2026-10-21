import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json';
import pl from '../../src/i18n/pl.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const coreDir = join(__dirname, '../../src/core');
const coreSource = readdirSync(coreDir)
  .map((f) => readFileSync(join(coreDir, f), 'utf8'))
  .join('\n');

describe('translations', () => {
  it('pl and en define the same keys', () => {
    expect(keys(pl).sort()).toEqual(keys(en).sort());
  });

  it('every issue code emitted by the core is translated', () => {
    const emitted = new Set([...coreSource.matchAll(/code: '(\w+)'/g)].map((m) => m[1]!));
    for (const ladder of [...coreSource.matchAll(/'(\w+Order)'\s*,?\s*\)/g)].map((m) => m[1]!)) {
      emitted.add(`${ladder}Error`).add(`${ladder}Equal`);
    }
    expect(emitted.size).toBeGreaterThan(20);
    const missing = [...emitted].filter((c) => !(c in en.issues) || !(c in pl.issues));
    expect(missing).toEqual([]);
  });

  it('every breakdown step is translated', () => {
    const steps = new Set([...coreSource.matchAll(/key: '(\w+)'/g)].map((m) => m[1]!));
    const conditional = [...coreSource.matchAll(/'(\w+)' : '(\w+)'/g)].flatMap((m) => [m[1]!, m[2]!]);
    conditional.forEach((s) => steps.add(s));
    const missing = [...steps].filter((s) => !(s in en.breakdown) || !(s in pl.breakdown));
    expect(missing).toEqual([]);
  });

  it('every key used by the XLSX export is translated', () => {
    const source = readFileSync(join(__dirname, '../../src/export/xlsx.ts'), 'utf8');
    const pattern = /'((?:xlsx|columns|settings|summary|input|breakdown|flex|status|matrix|common|months)\.[\w.]+)'/g;
    const used = new Set([...source.matchAll(pattern)].map((m) => m[1]!));
    const lookup = (obj: unknown, path: string) =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    expect(used.size).toBeGreaterThan(30);
    expect([...used].filter((k) => lookup(en, k) === undefined || lookup(pl, k) === undefined)).toEqual([]);
  });
});
