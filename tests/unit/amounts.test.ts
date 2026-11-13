import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { explainRow } from '../../src/core/explain';
import { calculate, priceAtBase, priceAtTop, shiftOverrides } from '../../src/core/pricing';
import { ge, lt, rat, sub } from '../../src/core/rational';
import type { Config, PriceList, ProductInput } from '../../src/core/types';
import { configArb, inputArb } from './arbitraries';
import { codes, config, input, row } from './helpers';

const amountConfig = (patch: (c: Config) => void = () => {}) =>
  config((c) => {
    c.discountMode = 'amount';
    patch(c);
  });

function amountList(
  amounts: Record<string, bigint> = {},
  options: { flexible?: boolean; maxPriceGr?: bigint; overrides?: Parameters<typeof calculate>[2] } = {},
  inp: ProductInput = input(1000, 1000),
  cfg: Config = amountConfig(),
): PriceList {
  const r = calculate({ ...inp, maxPriceGr: options.maxPriceGr }, cfg, options.overrides, {
    flexible: options.flexible,
    amounts,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.list;
}

describe('amount discounts (worked example: c = 10, N = 1000)', () => {
  const l = amountList();

  it('generates amounts from the cheapest month at the percent-mode base', () => {
    // Percent base 22.57 → Przedszczyt 3 retail ⌈22.57 · 0.70⌉ = 15.80.
    expect(l.amounts).toMatchObject({ refMonth: 'pre3', refRetail: 1580n, max: 329n });
    expect(l.amounts!.cells['1|retail']).toEqual({ gr: 0n, auto: 0n, manual: false });
    // 15.80 · (1 − 0.96 · 0.92) = 1.84544 → rounded down
    expect(l.amounts!.cells['100|w2']!.gr).toBe(184n);
    expect(l.amounts!.cells['300|w4']!.gr).toBe(329n);
  });

  it('prices every month as month price minus the same amount', () => {
    // B = ⌈(12.50 + 3.29) / 0.70⌉ = 22.56
    expect(l.base).toBe(2256n);
    expect(row(l, '1|retail|peak').netUnit).toBe(2256n);
    expect(row(l, '300|w4|peak').netUnit).toBe(2256n - 329n);
    expect(row(l, '100|w2|pre1').netUnit).toBe(2031n - 184n);
    const anchor = row(l, '300|w4|pre3');
    expect(anchor.netUnit).toBe(1580n - 329n);
    expect(anchor.status).toBe('anchor');
  });

  it('applies the same amounts in sale, from the sale minimum plus the largest amount', () => {
    expect(l.sale.baseCalculated).toBe(1150n + 329n);
    expect(row(l, '300|w4|sale').netUnit).toBe(1150n);
    expect(row(l, '100|w2|sale').netUnit).toBe(1479n - 184n);
  });

  it('keeps the configured % exactly in the cheapest month and smaller ones in dearer months', () => {
    const share = (key: string, month: string) => {
      const retail = row(l, `1|retail|${month}`).netUnit;
      return Number(retail - row(l, `${key}|${month}`).netUnit) / Number(retail);
    };
    // 20.88 % and 14.58 %, less the rounding of the amount down to the grosz
    expect(share('300|w4', 'pre3')).toBeCloseTo(0.2088, 2);
    expect(share('300|w4', 'peak')).toBeCloseTo(0.1458, 2);
  });

  it('explains a row as month price minus the amount', () => {
    const steps = explainRow(l, row(l, '100|w2|pre1'), amountConfig());
    const keys = steps.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['amountMax', 'amountBaseExact', 'amountMonthPrice', 'amountAuto']));
    expect(keys).not.toContain('tierMultiplier');
    expect(steps.find((s) => s.key === 'amountMonthPrice')!.value).toEqual({ money: 2031n });
  });
});

describe('breakdown in amount mode', () => {
  it.each([
    ['plain', {}],
    ['flexible', { flexible: true, maxPriceGr: 2000n }],
  ] as const)('reproduces every row (%s)', (_, options) => {
    const l = amountList({}, options);
    for (const r of l.rows) {
      const steps = explainRow(l, r, amountConfig());
      const exact = steps.find((s) => s.key === 'netExact')!.value as { moneyPrecise: { n: bigint; d: bigint } };
      const up = (exact.moneyPrecise.n + exact.moneyPrecise.d - 1n) / exact.moneyPrecise.d;
      expect([r.key, up]).toEqual([r.key, r.netUnit]);
    }
  });
});

describe('manual amounts', () => {
  it('raise the base so the deepest combination still reaches the minimum', () => {
    const l = amountList({ '300|w4': 500n });
    expect(l.amounts!.cells['300|w4']).toMatchObject({ gr: 500n, manual: true });
    expect(l.base).toBe(2500n); // ⌈(1250 + 500) / 0.7⌉
    expect(row(l, '300|w4|pre3').netUnit).toBe(1250n);
    expect(row(l, '300|w4|peak').netUnit).toBe(2000n);
  });

  it('warn when a larger package or a later customer gets a smaller amount', () => {
    const l = amountList({ '200|w4': 400n });
    expect(codes(l.issues)).toContain('amountTierOrder');
    expect(l.issues.find((i) => i.code === 'amountTierOrder')!.path).toBe('amounts.300|w4');
    const c = amountList({ '50|w1': 300n });
    expect(codes(c.issues)).toContain('amountCustomerOrder');
  });

  it('ignore negative values and cells of excluded packages', () => {
    const l = amountList({ '100|w2': -5n, '300|w4': 400n }, {}, input(1000, 200));
    expect(l.amounts!.cells['100|w2']!.manual).toBe(false);
    expect(l.amounts!.cells['300|w4']).toBeUndefined();
  });
});

describe('amount mode invariants (property)', () => {
  const amountArb = configArb.map((c) => ({ ...c, discountMode: 'amount' as const }));
  const withManual = fc.tuple(inputArb, amountArb, fc.array(fc.tuple(fc.nat(30), fc.bigInt({ min: 0n, max: 50_000n })), { maxLength: 6 }));

  const calcWith = (inp: ProductInput, cfg: Config, picks: [number, bigint][]) => {
    const first = amountList({}, {}, inp, cfg);
    const keys = Object.keys(first.amounts!.cells);
    const manual = Object.fromEntries(picks.map(([i, v]) => [keys[i % keys.length]!, v]));
    return amountList(manual, {}, inp, cfg);
  };

  it('no regular row below the minimum, no sale row below the sale minimum, anchor < 2 gr above', () => {
    fc.assert(
      fc.property(withManual, ([inp, cfg, picks]) => {
        const l = calcWith(inp, cfg, picks);
        const regular = l.rows.filter((r) => r.month !== 'sale');
        const deepest = regular.reduce((a, b) => (b.netUnit < a.netUnit ? b : a));
        return (
          regular.every((r) => ge(rat(r.netUnit), l.floor)) &&
          l.rows.filter((r) => r.month === 'sale').every((r) => ge(rat(r.netUnit), l.sale.cost)) &&
          lt(sub(rat(deepest.netUnit), l.floor), rat(2))
        );
      }),
      { numRuns: 200 },
    );
  });

  it('every price is its month price minus its amount', () => {
    fc.assert(
      fc.property(withManual, ([inp, cfg, picks]) => {
        const l = calcWith(inp, cfg, picks);
        return l.rows.every((r) => r.netUnit === priceAtBase(r, r.month === 'sale' ? l.sale.base : l.base));
      }),
      { numRuns: 200 },
    );
  });

  it('generated amounts never make a deeper combination dearer', () => {
    fc.assert(
      fc.property(inputArb, amountArb, (inp, cfg) => {
        const l = amountList({}, {}, inp, cfg);
        const rows = l.rows.filter((r) => r.month !== 'sale');
        return rows.every((a) => rows.every((b) => lt(a.multiplier, b.multiplier) || a.netUnit >= b.netUnit));
      }),
      { numRuns: 50 },
    );
  });

  it('a shift edit lands exactly on the typed price and keeps the amounts', () => {
    fc.assert(
      fc.property(inputArb, amountArb, fc.nat(1000), fc.bigInt({ min: 1n, max: 1_000_000n }), (inp, cfg, i, target) => {
        const l = amountList({}, {}, inp, cfg);
        const r = l.rows[i % l.rows.length]!;
        const next = amountList({}, { overrides: shiftOverrides(r, target, { rows: {} }) }, inp, cfg);
        return row(next, r.key).netUnit === target && next.amounts!.max === l.amounts!.max;
      }),
      { numRuns: 200 },
    );
  });
});

describe('amount mode with the flexible price list', () => {
  it('spreads prices between the minimum and the limit', () => {
    const l = amountList({}, { flexible: true, maxPriceGr: 2000n });
    expect(l.flex.active).toBe(true);
    const regular = l.rows.filter((r) => r.month !== 'sale');
    expect(regular.every((r) => r.netUnit >= 1250n && r.netUnit <= 2000n)).toBe(true);
    expect(row(l, '1|retail|peak').netUnit).toBe(2000n);
    expect(row(l, '300|w4|pre3').netUnit).toBe(1250n);
  });

  it('does nothing while the discounts fit under the limit', () => {
    const l = amountList({}, { flexible: true, maxPriceGr: 3000n });
    expect(l.flex.active).toBe(false);
    expect(l.rows.map((r) => r.netUnit)).toEqual(amountList().rows.map((r) => r.netUnit));
  });

  it('priceAtTop matches the engine for any top price', () => {
    const first = amountList({}, { flexible: true });
    fc.assert(
      fc.property(fc.bigInt({ min: 1250n, max: 4000n }), (top) => {
        const l = amountList({}, { flexible: true, overrides: { rows: {}, base: top } });
        return l.rows.every((x) => x.netUnit === priceAtTop(first, row(first, x.key), top));
      }),
      { numRuns: 80 },
    );
  });

  it('every reachable target is hit exactly', () => {
    const first = amountList({}, { flexible: true });
    const editable = first.rows.filter((x) => x.month !== 'sale' && x.status !== 'anchor');
    fc.assert(
      fc.property(fc.constantFrom(...editable), fc.integer({ min: 1300, max: 2200 }), (r, target) => {
        const next = amountList({}, { flexible: true, overrides: shiftOverrides(r, BigInt(target), { rows: {} }, first) });
        return row(next, r.key).netUnit === BigInt(target);
      }),
      { numRuns: 150 },
    );
  });
});
