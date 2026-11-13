/** Random valid configurations and inputs for property tests. */
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { Config, ProductInput } from '../../src/core/types';

/** Non-decreasing list of discounts (valid ladder). */
const ladder = (min: number, max: number) =>
  fc.array(fc.integer({ min: 0, max: 4000 }), { minLength: min, maxLength: max }).map((xs) => xs.sort((a, b) => a - b));

export const configArb: fc.Arbitrary<Config> = fc
  .record({
    handlingPct: fc.integer({ min: 0, max: 5000 }),
    handlingFixed: fc.integer({ min: 0, max: 10_000_000 }),
    profitPct: fc.integer({ min: 0, max: 5000 }),
    profitFixed: fc.integer({ min: 0, max: 100_000 }),
    vat: fc.constantFrom(0, 500, 800, 2300),
    tierQtys: fc.uniqueArray(fc.integer({ min: 2, max: 1000 }), { maxLength: 5 }),
    tierDiscounts: ladder(5, 5),
    customerDiscounts: ladder(1, 5),
    monthDiscounts: fc.array(fc.integer({ min: 0, max: 4000 }), { minLength: 1, maxLength: 5 }),
    sale: fc.integer({ min: 1, max: 20_000 }),
  })
  .map((r) => ({
    ...structuredClone(DEFAULT_CONFIG),
    handling: { percentBp: r.handlingPct, fixedGr: r.handlingFixed },
    minProfit: { percentBp: r.profitPct, fixedGr: r.profitFixed },
    vatBp: r.vat,
    packages: [...r.tierQtys].sort((a, b) => a - b).map((qty, i) => ({ qty, discountBp: r.tierDiscounts[i]! })),
    customers: r.customerDiscounts.map((discountBp, i) => ({
      id: `c${i}`,
      label: { pl: `k${i}`, en: `c${i}` },
      discountBp,
    })),
    months: r.monthDiscounts.map((discountBp, i) => ({ id: `m${i}`, label: { pl: `m${i}`, en: `m${i}` }, discountBp })),
    calendar: Array<string>(12).fill('m0'),
    sale: { factorBp: r.sale },
  }));

export const inputArb: fc.Arbitrary<ProductInput> = fc.record({
  name: fc.constant('p'),
  costGr: fc.bigInt({ min: 1n, max: 10_000_000n }),
  qty: fc.bigInt({ min: 1n, max: 100_000n }),
});
