import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { explainRow } from '../../src/core/explain';
import { calculate, shiftOverrides } from '../../src/core/pricing';
import { ge, le, mul, rat, sub } from '../../src/core/rational';
import { validateConfig } from '../../src/core/validate';
import { codes, config, input, list, row } from './helpers';

const withFee = (bp: number) => config((c) => (c.fees.percentBp = bp));
const withMax = (maxPriceGr: bigint) => ({ ...input(1000, 1000), maxPriceGr });

describe('price-proportional fees', () => {
  it('changes nothing at 0 %', () => {
    const l = list(input(1000, 1000));
    expect(l.floor).toEqual(rat(1250));
    expect(row(l, '1|retail|peak').feeUnit).toEqual(rat(0));
  });

  it('raises the floor so profit after the fee still reaches the minimum', () => {
    // fee 10 % of gross, VAT 23 % → 12,3 % of net; floor = 12,50 / 0,877
    const l = list(input(1000, 1000), withFee(1000));
    expect(l.fees.rate).toEqual(rat(123, 1000));
    expect(l.floor).toEqual(rat(1250 * 1000, 877));
    const anchor = row(l, '300|w4|pre3');
    // profit after fee ≥ minimum profit (1,00 zł)
    expect(ge(anchor.profitUnit, rat(100))).toBe(true);
    expect(anchor.feeUnit).toEqual(mul(rat(anchor.netUnit), rat(123, 1000)));
  });

  it('keeps a sale at 100 % break-even after the fee', () => {
    const l = list(input(1000, 1000), withFee(1000));
    const deepest = row(l, '300|w4|sale');
    expect(ge(deepest.profitUnit, rat(0))).toBe(true);
    expect(le(deepest.profitUnit, rat(2))).toBe(true);
  });

  it('explains the fee steps', () => {
    const cfg = withFee(500);
    const l = list(input(1000, 1000), cfg);
    const keys = explainRow(l, row(l, '1|retail|peak'), cfg).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['feeDivisor', 'feeUnit']));
    const saleKeys = explainRow(l, row(l, '1|retail|sale'), cfg).map((s) => s.key);
    expect(saleKeys).toContain('feeDivisor');
  });

  it('rejects fees that would take the whole price', () => {
    expect(codes(validateConfig(withFee(8200)))).toContain('feeTooHigh'); // 82 % × 1,23 > 100 %
    expect(codes(validateConfig(withFee(8000)))).not.toContain('feeTooHigh');
    expect(codes(validateConfig(withFee(-1)))).toContain('negativeValue');
  });

  it('never lets profit after fees drop below the minimum (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        (cost, qty, fee) => {
          const l = list(input(cost, qty), withFee(fee));
          const minProfit = l.minProfit;
          return l.rows
            .filter((r) => r.month !== 'sale')
            .every((r) => ge(sub(r.profitUnit, minProfit), rat(0)));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('flexible price list', () => {
  const flex = (inp: ReturnType<typeof withMax>, cfg = config()) => {
    const r = calculate(inp, cfg, { rows: {} }, { flexible: true });
    if (!r.ok) throw new Error('failed');
    return r.list;
  };

  it('does nothing when the discounts fit under the maximum', () => {
    const l = flex(withMax(3000n));
    expect(l.flex.active).toBe(false);
    expect(row(l, '1|retail|peak').netUnit).toBe(2257n);
  });

  it('spreads prices between the minimum and the maximum when they do not fit', () => {
    const l = flex(withMax(2000n));
    expect(l.flex.active).toBe(true);
    expect(l.topPrice).toBe(2000n);
    expect(row(l, '1|retail|peak').netUnit).toBe(2000n);
    expect(row(l, '300|w4|pre3').netUnit).toBe(1250n);
    expect(row(l, '300|w4|pre3').status).toBe('anchor');
    expect(l.rows.filter((r) => r.month !== 'sale').every((r) => r.flexed && !r.aboveMax)).toBe(true);
    expect(codes(l.issues)).toContain('flexActive');
    expect(codes(l.issues)).not.toContain('rowsAboveMax');
    // applied discounts are smaller than nominal ones
    const r = row(l, '100|w2|pre1');
    expect(r.effectiveDiscount.n * r.nominalDiscount.d < r.nominalDiscount.n * r.effectiveDiscount.d).toBe(true);
  });

  it('cannot help when the maximum is below the minimum price', () => {
    const l = flex(withMax(1200n));
    expect(l.flex.active).toBe(false);
    expect(codes(l.issues)).toContain('maxBelowFloor');
  });

  it('does nothing without a limit while the base price fits the discounts', () => {
    const r = calculate(input(1000, 1000), config(), { rows: {} }, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.flex.active).toBe(false);
    expect(row(r.list, '300|w4|pre3').netUnit).toBe(1251n);
  });

  it('works without a limit when the base price was lowered by hand', () => {
    const lowered = { rows: {}, base: 2000n };
    const plain = calculate(input(1000, 1000), config(), lowered);
    // without flexibility the deepest prices fall below the minimum
    expect(plain.ok && row(plain.list, '300|w4|pre3').status).toBe('error');
    const r = calculate(input(1000, 1000), config(), lowered, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.flex.active).toBe(true);
    expect(r.list.topPrice).toBe(2000n);
    expect(row(r.list, '1|retail|peak').netUnit).toBe(2000n);
    expect(row(r.list, '300|w4|pre3').netUnit).toBe(1250n);
    expect(r.list.rows.some((x) => x.status === 'error')).toBe(false);
    expect(codes(r.list.issues)).toContain('flexActive');
  });

  it('shift edits land exactly on the typed price when they switch flexible mode on', () => {
    const opts = { flexible: true };
    const first = calculate(input(1000, 1000), config(), { rows: {} }, opts);
    if (!first.ok) throw new Error('failed');
    const target = row(first.list, '50|retail|peak');
    const overrides = shiftOverrides(target, 2000n, { rows: {} }, first.list);
    const r = calculate(input(1000, 1000), config(), overrides, opts);
    if (!r.ok) throw new Error('failed');
    expect(r.list.flex.active).toBe(true);
    expect(row(r.list, '50|retail|peak').netUnit).toBe(2000n);
    expect(row(r.list, '300|w4|pre3').netUnit).toBe(1250n);
  });

  it('shift edits on the deepest row fall back to that row only', () => {
    const first = calculate(input(1000, 1000), config(), { rows: {} }, { flexible: true });
    if (!first.ok) throw new Error('failed');
    const overrides = shiftOverrides(row(first.list, '300|w4|pre3'), 1250n, { rows: {} }, first.list);
    expect(overrides).toEqual({ rows: { '300|w4|pre3': 1250n } });
  });

  it('every reachable target is hit exactly (property)', () => {
    const first = calculate(input(1000, 1000), config(), { rows: {} }, { flexible: true });
    if (!first.ok) throw new Error('failed');
    const editable = first.list.rows.filter((x) => x.month !== 'sale' && x.status !== 'anchor');
    fc.assert(
      fc.property(fc.constantFrom(...editable), fc.integer({ min: 1300, max: 2200 }), (r, target) => {
        const o = shiftOverrides(r, BigInt(target), { rows: {} }, first.list);
        const next = calculate(input(1000, 1000), config(), o, { flexible: true });
        return next.ok && row(next.list, r.key).netUnit === BigInt(target);
      }),
      { numRuns: 150 },
    );
  });

  it('uses the lower of the limit and a lowered base as the top', () => {
    const r = calculate({ ...input(1000, 1000), maxPriceGr: 2100n }, config(), { rows: {}, base: 1900n }, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.topPrice).toBe(1900n);
  });

  it('links sale prices to the regular top proportionally', () => {
    // regular top 20,00 → sale top ⌈2000 · 1454 / 2257⌉ = 12,89, spread down to the sale price 11,50
    const l = flex(withMax(2000n));
    expect(l.flex.saleTop).toBe(1289n);
    expect(row(l, '1|retail|sale').netUnit).toBe(1289n);
    expect(row(l, '300|w4|sale').netUnit).toBe(1150n);
    expect(codes(l.issues)).toContain('flexSaleActive');
  });

  it('raises sale prices with a raised base price', () => {
    const r = calculate(input(1000, 1000), config(), { rows: {}, base: 3000n }, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(r.list.flex.saleTop).toBe(1933n); // ⌈3000 · 1454 / 2257⌉
    expect(row(r.list, '1|retail|sale').netUnit).toBe(1933n);
    // without flexibility the sale prices would not move
    const plain = calculate(input(1000, 1000), config(), { rows: {}, base: 3000n });
    expect(plain.ok && row(plain.list, '1|retail|sale').netUnit).toBe(1454n);
  });

  it('never pushes sale prices below the sale price itself', () => {
    const l = flex(withMax(1400n));
    expect(l.flex.saleTop).toBe(1150n);
    expect(l.rows.filter((x) => x.month === 'sale').every((x) => x.netUnit === 1150n)).toBe(true);
  });

  it('a sale edit moves regular prices too and lands exactly on the target', () => {
    const first = flex(withMax(5000n));
    const target = row(first, '1|retail|sale');
    const o = shiftOverrides(target, 1300n, { rows: {}, saleBase: 9999n }, first);
    expect(o.saleBase).toBeUndefined();
    const r = calculate(withMax(5000n), config(), o, { flexible: true });
    if (!r.ok) throw new Error('failed');
    expect(row(r.list, '1|retail|sale').netUnit).toBe(1300n);
    expect(row(r.list, '1|retail|peak').netUnit).toBeLessThan(2257n);
  });

  it('sale edits hit every reachable target exactly (property)', () => {
    const first = flex(withMax(5000n));
    const saleRows = first.rows.filter((x) => x.month === 'sale' && x.key !== '300|w4|sale');
    fc.assert(
      fc.property(fc.constantFrom(...saleRows), fc.integer({ min: 1160, max: 1800 }), (r, t) => {
        const o = shiftOverrides(r, BigInt(t), { rows: {} }, first);
        const next = calculate(withMax(5000n), config(), o, { flexible: true });
        return next.ok && row(next.list, r.key).netUnit === BigInt(t);
      }),
      { numRuns: 150 },
    );
  });

  it('explains the flexible steps', () => {
    const l = flex(withMax(2000n));
    const keys = explainRow(l, row(l, '100|w2|pre1'), config()).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['flexTop', 'flexPosition']));
  });

  it('keeps every regular price between minimum and maximum, monotonic in the discount (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1300, max: 2256 }), (max) => {
        const l = flex(withMax(BigInt(max)));
        const regular = l.rows.filter((r) => r.month !== 'sale');
        const inRange = regular.every((r) => ge(rat(r.netUnit), l.floor) && r.netUnit <= BigInt(max));
        const monotonic = regular.every((a) =>
          regular.every((b) => mul(a.multiplier, rat(1)).n * b.multiplier.d < b.multiplier.n * a.multiplier.d || a.netUnit >= b.netUnit),
        );
        return inRange && monotonic;
      }),
      { numRuns: 60 },
    );
  });
});
