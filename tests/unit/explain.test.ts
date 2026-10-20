import { describe, expect, it } from 'vitest';
import { explainRow } from '../../src/core/explain';
import { rat } from '../../src/core/rational';
import { config, input, list, row } from './helpers';

const keys = (steps: { key: string }[]) => steps.map((s) => s.key);

describe('explainRow', () => {
  const cfg = config();

  it('explains a regular row from purchase cost to profit', () => {
    const l = list(input(1000, 1000), cfg);
    const steps = explainRow(l, row(l, '300|w4|pre3'), cfg);
    expect(keys(steps)).toEqual([
      'purchaseCost', 'handlingPercent', 'fixedHandling', 'unitCost', 'minProfit', 'floor', 'deepMultiplier',
      'baseExact', 'base', 'tierMultiplier', 'customerMultiplier', 'monthMultiplier', 'netExact', 'netUnit',
      'grossUnit', 'netTotal', 'grossTotal', 'grossNotDivisible', 'profitUnit',
    ]);
    expect(steps.find((s) => s.key === 'netExact')?.value).toEqual({ moneyPrecise: rat(125001688, 100000) });
  });

  it('explains a sale row with the sale base and without a month step', () => {
    const l = list(input(1000, 1000), cfg);
    const k = keys(explainRow(l, row(l, '50|retail|sale'), cfg));
    expect(k).toContain('saleBase');
    expect(k).not.toContain('monthMultiplier');
    expect(k).not.toContain('floor');
  });

  it('notes rounding of fixed handling and gross totals', () => {
    const l = list(input(1000, 3), cfg);
    const k = keys(explainRow(l, row(l, '1|retail|peak'), cfg));
    expect(k).toContain('fixedRounded');
    const l2 = list(input(1000, 1000), cfg);
    expect(keys(explainRow(l2, row(l2, '50|retail|peak'), cfg))).toContain('grossNotDivisible');
  });

  it('explains overrides, stale values and shortfalls', () => {
    const l = list(input(1000, 1000), cfg, { base: 2000n, rows: { '1|retail|peak': 1200n } });
    const k = keys(explainRow(l, row(l, '1|retail|peak'), cfg));
    expect(k).toEqual(expect.arrayContaining(['baseOverride', 'netOverride', 'belowFloor']));
    const sale = list(input(1000, 1000), cfg, { rows: { '300|w4|sale': 1000n } });
    expect(keys(explainRow(sale, row(sale, '300|w4|sale'), cfg))).toContain('belowSale');
    const stale = list(input(1000, 1000), cfg, { rows: { '1|w1|peak': 5000n } }, false);
    expect(keys(explainRow(stale, row(stale, '1|w1|peak'), cfg))).toContain('stale');
  });
});
