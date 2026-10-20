import { describe, expect, it } from 'vitest';
import { calculate } from '../../src/core/pricing';
import { rat } from '../../src/core/rational';
import { codes, config, input, list, row } from './helpers';

describe('golden example (SPEC §16)', () => {
  const l = list(input(1000, 1000));

  it('derives cost, floor and base', () => {
    expect(l.fixedPerUnit).toBe(50n);
    expect(l.unitCost).toEqual(rat(1150));
    expect(l.floor).toEqual(rat(1250));
    expect(l.deepest.multiplier).toEqual(rat(55384, 100000));
    expect(l.deepest).toMatchObject({ customerId: 'w4', month: 'pre3' });
    expect(l.deepest.tier.qty).toBe(300n);
    expect(l.base).toBe(2257n);
    expect(l.baseGross).toBe(2776n);
    expect(l.sale.base).toBe(1454n);
  });

  it('produces 5 tiers × 5 customers × 5 months', () => {
    expect(l.rows).toHaveLength(125);
  });

  it.each([
    // key, net, gross, netTotal, grossTotal, profit/unit (gr)
    ['1|retail|peak', 2257n, 2776n, 2257n, 2776n, 1107],
    ['50|retail|peak', 2212n, 2721n, 110600n, 136038n, 1062],
    ['100|w2|pre1', 1795n, 2208n, 179500n, 220785n, 645],
    ['300|w4|pre3', 1251n, 1539n, 375300n, 461619n, 101],
    ['300|w4|sale', 1151n, 1416n, 345300n, 424719n, 1],
    ['1|retail|sale', 1454n, 1788n, 1454n, 1788n, 304],
  ])('row %s', (key, net, gross, netTotal, grossTotal, profit) => {
    const r = row(l, key);
    expect(r.netUnit).toBe(net);
    expect(r.grossUnit).toBe(gross);
    expect(r.netTotal).toBe(netTotal);
    expect(r.grossTotal).toBe(grossTotal);
    expect(r.profitUnit).toEqual(rat(profit));
  });

  it('marks statuses', () => {
    expect(row(l, '300|w4|pre3').status).toBe('anchor');
    expect(row(l, '300|w4|sale').status).toBe('sale');
    expect(row(l, '1|retail|peak').status).toBe('ok');
  });

  it('flags gross totals that differ from unit × qty', () => {
    const r = row(l, '50|retail|peak');
    expect(r.grossNotDivisible).toBe(true);
    expect(r.grossUnit * 50n - r.grossTotal).toBe(12n);
  });

  it('reports nominal and effective discount', () => {
    const r = row(l, '300|w4|pre3');
    expect(r.nominalDiscount).toEqual(rat(44616, 100000));
    expect(r.effectiveDiscount).toEqual(rat(2257 - 1251, 2257));
  });

  it('reports high retail profit as info only', () => {
    expect(codes(l.issues)).toEqual(['retailProfitHigh']);
    expect(l.retailProfitPct).toEqual(rat(1107, 1000));
  });
});

describe('fixed handling covers the whole purchased volume', () => {
  it('spreads H over N and rounds up', () => {
    const l = list(input(1000, 3));
    expect(l.fixedPerUnitExact).toEqual(rat(50000, 3));
    expect(l.fixedPerUnit).toBe(16667n);
    // Recovered over the whole volume ≥ H.
    expect(l.fixedPerUnit * 3n >= 50000n).toBe(true);
  });

  it('warns when fixed handling dominates the unit cost', () => {
    const l = list(input(1000, 3));
    expect(codes(l.issues)).toContain('fixedHandlingDominates');
  });
});

describe('package tiers vs purchased quantity', () => {
  it('excludes tiers above N with a warning', () => {
    const l = list(input(1000, 200));
    expect(l.tiers.map((t) => t.qty)).toEqual([1n, 50n, 100n, 200n]);
    expect(l.deepest.tier.qty).toBe(200n);
    const w = l.issues.filter((i) => i.code === 'tierExceedsQty');
    expect(w).toHaveLength(1);
    expect(w[0]!.path).toBe('packages.3.qty');
  });

  it('informs when no tier applies', () => {
    const l = list(input(1000, 10));
    expect(l.tiers).toHaveLength(1);
    expect(codes(l.issues)).toContain('noTiers');
    expect(l.rows).toHaveLength(25);
  });

  it('works with no package tiers configured', () => {
    const l = list(input(1000, 1000), config((c) => (c.packages = [])));
    expect(l.rows).toHaveLength(25);
  });
});

describe('sale', () => {
  it('warns about selling below cost with the loss per unit', () => {
    const l = list(input(1000, 1000), config((c) => (c.sale.factorBp = 9000)));
    const w = l.issues.find((i) => i.code === 'saleBelowCost')!;
    expect(w.params?.loss).toEqual({ moneyRat: rat(115) });
    // ⌈⌈1035 / 0.7912⌉ · 0.7912⌉ = ⌈1309 · 0.7912⌉
    expect(row(l, '300|w4|sale').netUnit).toBe(1036n);
  });

  it('warns when sale prices exceed regular ones', () => {
    const l = list(input(1000, 1000), config((c) => (c.sale.factorBp = 13000)));
    expect(codes(l.issues)).toContain('saleAboveRegular');
  });
});

describe('overrides and smart updates', () => {
  it('recomputes an edited row', () => {
    const l = list(input(1000, 1000), config(), { rows: { '1|retail|peak': 3000n } });
    const r = row(l, '1|retail|peak');
    expect(r).toMatchObject({ netUnit: 3000n, grossUnit: 3690n, status: 'override', stale: false });
    expect(r.profitUnit).toEqual(rat(1850));
  });

  it('marks an edited row below floor as error with shortfall', () => {
    const l = list(input(1000, 1000), config(), { rows: { '1|retail|peak': 1200n } });
    const r = row(l, '1|retail|peak');
    expect(r.status).toBe('error');
    expect(r.shortfall).toEqual(rat(50));
    expect(codes(l.issues)).toContain('rowsBelowFloor');
  });

  it('marks an edited sale row below sale price as error', () => {
    const l = list(input(1000, 1000), config(), { rows: { '300|w4|sale': 1100n } });
    expect(row(l, '300|w4|sale').status).toBe('error');
  });

  it('recomputes all non-edited rows from an edited base price', () => {
    const l = list(input(1000, 1000), config(), { base: 3000n, rows: { '50|retail|peak': 2500n } });
    expect(l.baseOverridden).toBe(true);
    expect(row(l, '1|retail|peak').netUnit).toBe(3000n);
    expect(row(l, '50|retail|peak').netUnit).toBe(2500n);
    // Sale rows keep their own base.
    expect(row(l, '300|w4|sale').netUnit).toBe(1151n);
  });

  it('flags rows below floor after lowering the base', () => {
    const l = list(input(1000, 1000), config(), { base: 2000n, rows: {} });
    expect(row(l, '300|w4|pre3').status).toBe('error');
    expect(codes(l.issues)).toContain('rowsBelowFloor');
  });

  it('keeps derived values stale when smart updates are off', () => {
    const l = list(input(1000, 1000), config(), { rows: { '1|retail|peak': 3000n } }, false);
    const r = row(l, '1|retail|peak');
    expect(r).toMatchObject({ netUnit: 3000n, grossUnit: 2776n, stale: true, status: 'override' });
    expect(codes(l.issues)).toContain('staleRows');
  });

  it('marks regular rows stale after a base edit without smart updates', () => {
    const l = list(input(1000, 1000), config(), { base: 3000n, rows: {} }, false);
    expect(l.base).toBe(3000n);
    expect(row(l, '1|retail|peak')).toMatchObject({ netUnit: 2257n, stale: true });
    expect(row(l, '1|retail|sale').stale).toBe(false);
  });

  it('ignores overrides for rows that do not exist', () => {
    const l = list(input(1000, 100), config(), { rows: { '300|w4|pre3': 1n } });
    expect(l.rows.some((r) => r.overridden)).toBe(false);
  });
});

describe('rejections', () => {
  it('rejects invalid input', () => {
    const r = calculate(input(0, 0), config());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r.issues)).toEqual(['costNonPositive', 'qtyNonPositive']);
  });

  it('rejects configs with errors', () => {
    const r = calculate(input(1000, 1000), config((c) => (c.months[3]!.discountBp = 10000)));
    expect(r.ok).toBe(false);
  });

  it('rejects results out of the supported range', () => {
    const r = calculate(
      input(999_999_999, 1),
      config((c) => (c.months[3]!.discountBp = 9900)),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r.issues)).toContain('outOfRange');
  });
});

describe('custom month types', () => {
  it('prices every month type the user defines and anchors on the deepest one', () => {
    const cfg = config((c) => {
      c.months = [
        { id: 'summer', label: { pl: 'Szczyt letni', en: 'Summer peak' }, discountBp: 0 },
        { id: 'winter', label: { pl: 'Szczyt zimowy', en: 'Winter peak' }, discountBp: 0 },
        { id: 'quiet', label: { pl: 'Cisza', en: 'Quiet' }, discountBp: 1500 },
      ];
      c.calendar = Array(12).fill('summer');
    });
    const l = list(input(1000, 1000), cfg);
    expect(l.rows).toHaveLength(5 * 5 * 4);
    expect(l.deepest.month).toBe('quiet');
    expect(row(l, '1|retail|summer').netUnit).toBe(row(l, '1|retail|winter').netUnit);
    expect(row(l, '300|w4|quiet').status).toBe('anchor');
  });
});

describe('edge cases', () => {
  it('handles zero handling and zero profit', () => {
    const cfg = config((c) => {
      c.handling = { percentBp: 0, fixedGr: 0 };
      c.minProfit = { percentBp: 0, fixedGr: 0 };
    });
    const l = list(input(1000, 1000), cfg);
    expect(row(l, '300|w4|pre3').netUnit >= 1000n).toBe(true);
  });

  it('handles a single unit bought', () => {
    const l = list(input(1, 1));
    expect(l.rows).toHaveLength(25);
    expect(l.rows.every((r) => r.netUnit > 0n)).toBe(true);
  });

  it('adds the fixed min profit per unit', () => {
    const l = list(input(1000, 1000), config((c) => (c.minProfit.fixedGr = 25)));
    expect(l.floor).toEqual(rat(1275));
  });

  it('uses the configured peak discount', () => {
    const l = list(input(1000, 1000), config((c) => (c.months[0]!.discountBp = 500)));
    expect(row(l, '1|retail|peak').netUnit).toBe((l.base * 95n + 99n) / 100n);
  });
});
