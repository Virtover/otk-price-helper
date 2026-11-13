/**
 * Property-based tests for the invariants in SPEC.md §5.3 and for exact
 * round-trips of number formats.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatBpInput, formatMoney, formatMultiplierInput, parseMoney, parseMultiplierBp, parsePercentBp } from '../../src/core/money';
import { calculate } from '../../src/core/pricing';
import { ge, le, lt, mul, rat, sub } from '../../src/core/rational';
import type { Config, ProductInput } from '../../src/core/types';
import { configArb, inputArb } from './arbitraries';

const RUNS = 300;

function calc(inp: ProductInput, cfg: Config) {
  const r = calculate(inp, cfg);
  if (!r.ok) throw new Error(JSON.stringify(r.issues.map((i) => i.code)));
  return r.list;
}

describe('pricing invariants', () => {
  it('I1: no regular row is below the floor', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) => {
        const l = calc(inp, cfg);
        return l.rows.filter((r) => r.month !== 'sale').every((r) => ge(rat(r.netUnit), l.floor));
      }),
      { numRuns: RUNS },
    );
  });

  it('I2: the anchor is less than 2 grosze above the floor', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) => {
        const l = calc(inp, cfg);
        const anchors = l.rows.filter((r) => r.status === 'anchor');
        return anchors.length > 0 && anchors.every((r) => lt(sub(rat(r.netUnit), l.floor), rat(2)));
      }),
      { numRuns: RUNS },
    );
  });

  it('I3: net totals are exactly unit × quantity', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) =>
        calc(inp, cfg).rows.every((r) => r.netTotal === r.netUnit * r.qty && r.netTotal % r.qty === 0n),
      ),
      { numRuns: RUNS },
    );
  });

  it('I4: a deeper multiplier never gives a higher price', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) => {
        const rows = calc(inp, cfg).rows.filter((r) => r.month !== 'sale');
        return rows.every((a) => rows.every((b) => lt(a.multiplier, b.multiplier) || a.netUnit >= b.netUnit));
      }),
      { numRuns: 50 },
    );
  });

  it('I5: no sale row is below s·K', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) => {
        const l = calc(inp, cfg);
        return l.rows.filter((r) => r.month === 'sale').every((r) => ge(rat(r.netUnit), l.sale.cost));
      }),
      { numRuns: RUNS },
    );
  });

  it('I6: the order of package tiers in the config does not matter', () => {
    const withShuffle = configArb.chain((cfg) =>
      fc.tuple(
        fc.constant(cfg),
        fc.shuffledSubarray(cfg.packages, { minLength: cfg.packages.length, maxLength: cfg.packages.length }),
      ),
    );
    fc.assert(
      fc.property(inputArb, withShuffle, (inp, [cfg, packages]) => {
        const a = calc(inp, cfg).rows.map((r) => [r.key, r.netUnit]);
        const b = calc(inp, { ...cfg, packages }).rows.map((r) => [r.key, r.netUnit]);
        expect(b).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });

  it('gross is VAT on net, rounded half-up', () => {
    fc.assert(
      fc.property(inputArb, configArb, (inp, cfg) => {
        const vat = rat(10000 + cfg.vatBp, 10000);
        return calc(inp, cfg).rows.every((r) => {
          const exact = mul(rat(r.netTotal), vat);
          const diff = sub(rat(r.grossTotal), exact);
          return ge(diff, rat(-1, 2)) && le(diff, rat(1, 2));
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('format round-trips', () => {
  it('money parse ∘ format = id', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.constantFrom('pl' as const, 'en' as const), (gr, loc) => {
        const text = formatMoney(gr, loc);
        // en uses "," for grouping, which the parser rejects as ambiguous — strip it.
        const r = parseMoney(loc === 'en' ? text.replace(/,/g, '') : text);
        return r.ok && r.value === gr;
      }),
    );
  });

  it('percent ⇔ multiplier is exact for every discount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), fc.constantFrom('pl' as const, 'en' as const), (bp, loc) => {
        const pct = parsePercentBp(formatBpInput(bp, loc));
        const mult = parseMultiplierBp(formatMultiplierInput(10000 - bp, loc));
        return pct.ok && mult.ok && pct.value === BigInt(bp) && 10000n - mult.value === BigInt(bp);
      }),
    );
  });
});
