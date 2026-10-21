import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculate, clampToFlex, flexRange, priceAtTop, shiftOverrides, unitForPackageTotal } from '../../src/core/pricing';
import type { PriceList } from '../../src/core/types';
import { config, input, list, row } from './helpers';

function flexList(maxPriceGr?: bigint): PriceList {
  const r = calculate({ ...input(1000, 1000), maxPriceGr }, config(), { rows: {} }, { flexible: true });
  if (!r.ok) throw new Error('failed');
  return r.list;
}

describe('priceAtTop', () => {
  it('matches the engine for any top price (property)', () => {
    const first = flexList();
    fc.assert(
      fc.property(fc.bigInt({ min: 1250n, max: 4000n }), (top) => {
        const r = calculate(input(1000, 1000), config(), { rows: {}, base: top }, { flexible: true });
        return r.ok && r.list.rows.every((x) => x.netUnit === priceAtTop(first, row(first, x.key), top));
      }),
      { numRuns: 80 },
    );
  });
});

describe('flexRange', () => {
  it('is undefined outside flexible mode', () => {
    const l = list(input(1000, 1000));
    expect(flexRange(l, row(l, '1|retail|peak'))).toBeUndefined();
  });

  it('has only a minimum without a price limit', () => {
    const l = flexList();
    expect(flexRange(l, row(l, '1|retail|peak'))).toEqual({ min: 1250n });
    expect(flexRange(l, row(l, '1|retail|sale'))).toEqual({ min: 1150n });
  });

  it('lets every row reach the limit (sale rows: the highest sale price it allows)', () => {
    const l = flexList(2000n);
    expect(flexRange(l, row(l, '1|retail|peak'))).toEqual({ min: 1250n, max: 2000n });
    expect(flexRange(l, row(l, '300|w4|pre3'))).toEqual({ min: 1250n, max: 2000n });
    expect(flexRange(l, row(l, '1|retail|sale'))).toEqual({ min: 1150n, max: 1289n });
    expect(flexRange(l, row(l, '300|w4|sale'))).toEqual({ min: 1150n, max: 1289n });
  });

  it('pushing a discounted price to the limit raises the bottom: symmetric to the minimum', () => {
    const l = flexList(2000n);
    const o = shiftOverrides(row(l, '300|w4|pre3'), 2000n, { rows: {} }, l);
    expect(o).toMatchObject({ base: 2000n, flexLow: 2000n });
    const r = calculate({ ...input(1000, 1000), maxPriceGr: 2000n }, config(), o, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.rows.filter((x) => x.month !== 'sale').every((x) => x.netUnit === 2000n)).toBe(true);
  });

  it('a discounted price between its old cap and the limit shrinks the discounts', () => {
    const l = flexList(2000n);
    const o = shiftOverrides(row(l, '100|w2|pre1'), 1900n, { rows: {} }, l);
    const r = calculate({ ...input(1000, 1000), maxPriceGr: 2000n }, config(), o, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(row(r.list, '100|w2|pre1').netUnit).toBe(1900n);
    expect(row(r.list, '1|retail|peak').netUnit).toBe(2000n);
    expect(row(r.list, '300|w4|pre3').netUnit).toBeGreaterThan(1250n);
    expect(r.list.issues.map((i) => i.code)).toContain('flexLowRaised');
  });

  it('pushing a sale price to its cap raises the sale bottom', () => {
    const l = flexList(2000n);
    const o = shiftOverrides(row(l, '300|w4|sale'), 1289n, { rows: {} }, l);
    const r = calculate({ ...input(1000, 1000), maxPriceGr: 2000n }, config(), o, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.rows.filter((x) => x.month === 'sale').every((x) => x.netUnit === 1289n)).toBe(true);
  });
});

describe('clampToFlex', () => {
  const l = flexList(2000n);
  const r = row(l, '50|retail|peak');

  it('raises prices below the minimum', () => {
    expect(clampToFlex(l, r, 500n)).toMatchObject({ value: 1250n, reason: 'min' });
    expect(clampToFlex(l, r, 1250n).reason).toBeUndefined();
  });

  it('lowers prices above what the limit allows', () => {
    const max = flexRange(l, r)!.max!;
    expect(clampToFlex(l, r, 9999n)).toMatchObject({ value: max, reason: 'max' });
  });

  it('leaves prices alone outside flexible mode', () => {
    const plain = list(input(1000, 1000));
    expect(clampToFlex(plain, row(plain, '1|retail|peak'), 1n)).toEqual({ value: 1n });
  });

  it('a clamped shift edit always lands exactly on the clamped price (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...l.rows), fc.bigInt({ min: 1n, max: 6000n }), (x, target) => {
        const clamped = clampToFlex(l, x, target).value;
        const o = shiftOverrides(x, clamped, { rows: {} }, l);
        const next = calculate({ ...input(1000, 1000), maxPriceGr: 2000n }, config(), o, { flexible: true });
        return next.ok && row(next.list, x.key).netUnit === clamped;
      }),
      { numRuns: 300 },
    );
  });
});

describe('chained flexible edits', () => {
  it('a second edit lands exactly, whatever the first one did (property)', () => {
    const inp = { ...input(1000, 1000), maxPriceGr: 2000n };
    const first = flexList(2000n);
    fc.assert(
      fc.property(
        fc.constantFrom(...first.rows),
        fc.bigInt({ min: 1n, max: 6000n }),
        fc.constantFrom(...first.rows),
        fc.bigInt({ min: 1n, max: 6000n }),
        (r1, t1, r2, t2) => {
          const o1 = shiftOverrides(r1, clampToFlex(first, r1, t1).value, { rows: {} }, first);
          const mid = calculate(inp, config(), o1, { flexible: true });
          if (!mid.ok) return false;
          const target = clampToFlex(mid.list, row(mid.list, r2.key), t2).value;
          const o2 = shiftOverrides(row(mid.list, r2.key), target, o1, mid.list);
          const end = calculate(inp, config(), o2, { flexible: true });
          return end.ok && row(end.list, r2.key).netUnit === target && end.list.rows.every((x) => x.status !== 'error');
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('unitForPackageTotal', () => {
  it.each([
    [88500n, 50n, 1770n],
    [88510n, 50n, 1770n],
    [88525n, 50n, 1771n],
    [1n, 50n, 1n],
    [2257n, 1n, 2257n],
  ])('%s gr for %s pcs → %s gr per unit', (total, qty, unit) => {
    expect(unitForPackageTotal(total, qty)).toBe(unit);
  });
});
