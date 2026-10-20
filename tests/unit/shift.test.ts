import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { explainRow } from '../../src/core/explain';
import { baseForTarget, calculate, multiplierOf, shiftOverrides } from '../../src/core/pricing';
import { ceil, mul, product, rat } from '../../src/core/rational';
import { validateInput } from '../../src/core/validate';
import { codes, config, input, list, row } from './helpers';

const withMax = (maxPriceGr: bigint) => ({ ...input(1000, 1000), maxPriceGr });

describe('baseForTarget', () => {
  it('hits every target exactly with the smallest base', () => {
    const multiplier = fc
      .array(fc.integer({ min: 0, max: 9999 }), { minLength: 1, maxLength: 3 })
      .map((bps) => product(bps.map(multiplierOf)));
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1_000_000_000n }), multiplier, (target, m) => {
        const base = baseForTarget(target, m);
        return ceil(mul(rat(base), m)) === target && ceil(mul(rat(base - 1n), m)) < target;
      }),
    );
  });

  it('is the identity for multiplier 1', () => {
    expect(baseForTarget(2257n, rat(1))).toBe(2257n);
  });
});

describe('shift editing', () => {
  const cfg = config();
  const l = list(input(1000, 1000), cfg);

  it('moves the regular base so the edited row lands exactly on the target', () => {
    const r = row(l, '50|retail|peak');
    const overrides = shiftOverrides(r, 2500n, { rows: { [r.key]: 9999n, other: 1n } });
    expect(overrides.rows).toEqual({ other: 1n });
    const shifted = list(input(1000, 1000), cfg, overrides);
    expect(row(shifted, '50|retail|peak').netUnit).toBe(2500n);
    expect(row(shifted, '50|retail|peak').status).toBe('ok');
    // Other rows follow their discounts from the new base.
    expect(row(shifted, '1|retail|peak').netUnit).toBe(shifted.base);
    expect(shifted.base).toBeGreaterThan(l.base);
    // Sale rows keep their own base.
    expect(row(shifted, '300|w4|sale').netUnit).toBe(row(l, '300|w4|sale').netUnit);
  });

  it('moves only the sale base for sale rows', () => {
    const r = row(l, '1|retail|sale');
    const shifted = list(input(1000, 1000), cfg, shiftOverrides(r, 1600n, { rows: {} }));
    expect(shifted.sale.baseOverridden).toBe(true);
    expect(row(shifted, '1|retail|sale').netUnit).toBe(1600n);
    expect(row(shifted, '50|w1|sale').netUnit).toBeGreaterThan(row(l, '50|w1|sale').netUnit);
    expect(row(shifted, '1|retail|peak').netUnit).toBe(l.base);
    expect(explainRow(shifted, row(shifted, '1|retail|sale'), cfg).map((s) => s.key)).toContain('saleBaseOverride');
  });

  it('flags rows pushed below the floor by a downward shift', () => {
    const shifted = list(input(1000, 1000), cfg, shiftOverrides(row(l, '1|retail|peak'), 2000n, { rows: {} }));
    expect(row(shifted, '300|w4|pre3').status).toBe('error');
  });

  it('marks sale rows stale when smart updates are off', () => {
    const r = row(l, '1|retail|sale');
    const stale = list(input(1000, 1000), cfg, shiftOverrides(r, 1600n, { rows: {} }), false);
    expect(row(stale, '50|w1|sale').stale).toBe(true);
    expect(row(stale, '50|w1|peak').stale).toBe(false);
  });
});

describe('maximum price', () => {
  it('flags rows above the limit and reports them', () => {
    const l = list(withMax(2000n));
    expect(row(l, '1|retail|peak').aboveMax).toBe(true);
    expect(row(l, '300|w4|pre3').aboveMax).toBe(false);
    const issue = l.issues.find((i) => i.code === 'rowsAboveMax')!;
    expect(issue.params?.count).toBe(l.rows.filter((r) => r.netUnit > 2000n).length);
    expect(issue.path).toBe('input.maxPriceGr');
    expect(explainRow(l, row(l, '1|retail|peak'), config()).map((s) => s.key)).toContain('aboveMax');
  });

  it('does not flag anything without a limit or with a high one', () => {
    expect(list(input(1000, 1000)).rows.some((r) => r.aboveMax)).toBe(false);
    expect(codes(list(withMax(100_000n)).issues)).not.toContain('rowsAboveMax');
  });

  it('warns when the limit is below the minimum price', () => {
    expect(codes(list(withMax(1200n)).issues)).toContain('maxBelowFloor');
  });

  it('rejects a non-positive limit', () => {
    expect(codes(validateInput(withMax(0n)))).toEqual(['maxPriceNonPositive']);
    expect(calculate(withMax(0n), config()).ok).toBe(false);
  });
});
