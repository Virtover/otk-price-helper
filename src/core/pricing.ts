/**
 * Pricing engine — implements SPEC.md §5.
 *
 * The base price B is anchored so that the deepest regular (non-sale) discount
 * combination lands exactly on the minimum-profit floor F; every other row is
 * B × its multiplier, rounded up to the grosz. Net is the divisible price basis.
 */
import {
  type Rat,
  ONE,
  add,
  ceil,
  div,
  eq,
  fromBp,
  gt,
  lt,
  mul,
  product,
  rat,
  roundHalf,
  sub,
} from './rational';
import type {
  Config,
  Issue,
  MonthType,
  Overrides,
  PriceList,
  PriceResult,
  PriceRow,
  ProductInput,
  RegularMonth,
  RowStatus,
  Tier,
} from './types';
import { MONTH_TYPES, REGULAR_MONTHS } from './types';
import { MAX_COST_GR, hasErrors, validateConfig, validateInput } from './validate';

/** Largest supported unit price: 10 000 000 PLN. */
export const MAX_PRICE_GR = MAX_COST_GR;

export const rowKey = (qty: bigint, customerId: string, month: MonthType) => `${qty}|${customerId}|${month}`;

/** Discount in bp → price multiplier (500 bp → 0.95). */
export const multiplierOf = (discountBp: number): Rat => sub(ONE, fromBp(discountBp));

export function monthDiscountBp(config: Config, month: RegularMonth): number {
  switch (month) {
    case 'peak':
      return config.months.peakBp;
    case 'pre1':
      return config.months.prePeakBp[0];
    case 'pre2':
      return config.months.prePeakBp[1];
    case 'pre3':
      return config.months.prePeakBp[2];
  }
}

/** Element with the largest key; on ties the last one wins (deeper in the ladder). */
function deepestBy<T>(items: readonly T[], key: (t: T) => number): T {
  return items.reduce((best, cur) => (key(cur) >= key(best) ? cur : best));
}

export interface CalculateOptions {
  /** Recompute derived columns of edited rows (default true). */
  smartUpdates?: boolean;
}

export function calculate(
  input: ProductInput,
  config: Config,
  overrides: Overrides = { rows: {} },
  options: CalculateOptions = {},
): PriceResult {
  const smart = options.smartUpdates ?? true;
  const preIssues = [...validateInput(input), ...validateConfig(config)];
  if (hasErrors(preIssues)) return { ok: false, issues: preIssues };
  const issues: Issue[] = [...preIssues];

  const c = rat(input.costGr);
  const vat = add(ONE, fromBp(config.vatBp));

  // 1. Unit cost K = c·(1+h) + ⌈H/N⌉ — fixed handling covers the whole purchased volume.
  const handlingPercent = mul(c, fromBp(config.handling.percentBp));
  const fixedPerUnitExact = rat(config.handling.fixedGr, input.qty);
  const fixedPerUnit = ceil(fixedPerUnitExact);
  const unitCost = add(add(c, handlingPercent), rat(fixedPerUnit));

  // 2. Floor F = K + c·p% + P.
  const minProfit = add(mul(c, fromBp(config.minProfit.percentBp)), rat(config.minProfit.fixedGr));
  const floor = add(unitCost, minProfit);

  // 3. Eligible tiers: implicit single unit + tiers not larger than the purchased quantity.
  const tiers: Tier[] = [{ qty: 1n, discountBp: 0, implicit: true }];
  config.packages
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => a.qty - b.qty)
    .forEach((p) => {
      if (BigInt(p.qty) > input.qty) {
        issues.push({
          level: 'warning',
          code: 'tierExceedsQty',
          params: { tier: p.qty, qty: input.qty.toString() },
          path: `packages.${p.i}.qty`,
        });
      } else {
        tiers.push({ qty: BigInt(p.qty), discountBp: p.discountBp, implicit: false });
      }
    });
  if (tiers.length === 1) issues.push({ level: 'info', code: 'noTiers', params: { qty: input.qty.toString() } });

  // 4. Deepest regular combination → base price B = ⌈F / M_deep⌉.
  const deepTier = deepestBy(tiers, (t) => t.discountBp);
  const deepCustomer = deepestBy(config.customers, (cu) => cu.discountBp);
  const deepMonth = deepestBy(REGULAR_MONTHS, (m) => monthDiscountBp(config, m));
  const deepMultiplier = product([
    multiplierOf(deepTier.discountBp),
    multiplierOf(deepCustomer.discountBp),
    multiplierOf(monthDiscountBp(config, deepMonth)),
  ]);
  const baseExact = div(floor, deepMultiplier);
  const baseCalculated = ceil(baseExact);
  if (baseCalculated > MAX_PRICE_GR) {
    return { ok: false, issues: [...issues, { level: 'error', code: 'outOfRange', path: 'input.costGr' }] };
  }
  const baseOverridden = overrides.base !== undefined;
  const base = overrides.base ?? baseCalculated;

  // 5. Sale: deepest package × customer combination priced at s·K.
  const saleCost = mul(unitCost, fromBp(config.sale.factorBp));
  const saleDeepMultiplier = mul(multiplierOf(deepTier.discountBp), multiplierOf(deepCustomer.discountBp));
  const saleBaseExact = div(saleCost, saleDeepMultiplier);
  const saleBase = ceil(saleBaseExact);

  // 6. Rows.
  const rows: PriceRow[] = [];
  for (const tier of tiers) {
    for (const customer of config.customers) {
      for (const month of MONTH_TYPES) {
        const isSale = month === 'sale';
        const parts = [multiplierOf(tier.discountBp), multiplierOf(customer.discountBp)];
        if (!isSale) parts.push(multiplierOf(monthDiscountBp(config, month)));
        const multiplier = product(parts);
        const key = rowKey(tier.qty, customer.id, month);

        // With smart updates off the derived columns keep their pre-edit values.
        const refBase = isSale ? saleBase : smart ? base : baseCalculated;
        const calculatedNet = ceil(mul(rat(refBase), multiplier));
        const overrideNet = overrides.rows[key];
        const shownNet = overrideNet ?? calculatedNet;
        const derivedNet = smart ? shownNet : calculatedNet;
        const stale = !smart && (overrideNet !== undefined || (baseOverridden && !isSale));

        const threshold = isSale ? saleCost : floor;
        const net = rat(shownNet);
        let status: RowStatus;
        let shortfall: Rat | undefined;
        if (lt(net, threshold)) {
          status = 'error';
          shortfall = sub(threshold, net);
        } else if (overrideNet !== undefined) status = 'override';
        else if (isSale) status = 'sale';
        else if (eq(multiplier, deepMultiplier)) status = 'anchor';
        else status = 'ok';

        const grossUnit = roundHalf(mul(rat(derivedNet), vat));
        const netTotal = derivedNet * tier.qty;
        const grossTotal = roundHalf(mul(rat(netTotal), vat));
        const profitUnit = sub(rat(derivedNet), unitCost);

        rows.push({
          key,
          qty: tier.qty,
          customerId: customer.id,
          month,
          multiplier,
          netUnit: shownNet,
          grossUnit,
          netTotal,
          grossTotal,
          grossNotDivisible: grossTotal !== grossUnit * tier.qty,
          profitUnit,
          profitTotal: mul(profitUnit, rat(tier.qty)),
          profitPct: div(profitUnit, c),
          nominalDiscount: sub(ONE, multiplier),
          effectiveDiscount: sub(ONE, div(rat(derivedNet), rat(refBase))),
          status,
          overridden: overrideNet !== undefined,
          stale,
          shortfall,
        });
      }
    }
  }

  // 7. Result-level feedback.
  if (gt(rat(fixedPerUnit), c)) {
    issues.push({
      level: 'warning',
      code: 'fixedHandlingDominates',
      params: { share: { pct: div(rat(fixedPerUnit), unitCost) }, perUnit: { money: fixedPerUnit } },
      path: 'input.qty',
    });
  }
  const retail = rows.find((r) => r.qty === 1n && r.customerId === config.customers[0]!.id && r.month === 'peak')!;
  if (gt(retail.profitPct, ONE)) {
    issues.push({ level: 'info', code: 'retailProfitHigh', params: { pct: { pct: retail.profitPct } } });
  }
  if (config.sale.factorBp < 10000) {
    issues.push({
      level: 'warning',
      code: 'saleBelowCost',
      params: { loss: { moneyRat: sub(unitCost, saleCost) } },
      path: 'sale.factorBp',
    });
  }
  const regularDeep = new Map(
    rows.filter((r) => r.month === deepMonth).map((r) => [`${r.qty}|${r.customerId}`, r.netUnit]),
  );
  const saleAbove = rows.filter(
    (r) => r.month === 'sale' && r.netUnit > (regularDeep.get(`${r.qty}|${r.customerId}`) ?? r.netUnit),
  ).length;
  if (saleAbove > 0) {
    issues.push({ level: 'warning', code: 'saleAboveRegular', params: { count: saleAbove }, path: 'sale.factorBp' });
  }
  const errorRows = rows.filter((r) => r.status === 'error').length;
  if (errorRows > 0) issues.push({ level: 'error', code: 'rowsBelowFloor', params: { count: errorRows } });
  const staleRows = rows.filter((r) => r.stale).length;
  if (staleRows > 0) issues.push({ level: 'info', code: 'staleRows', params: { count: staleRows } });

  const list: PriceList = {
    input,
    handlingPercent,
    fixedPerUnitExact,
    fixedPerUnit,
    unitCost,
    minProfit,
    floor,
    tiers,
    deepest: { tier: deepTier, customerId: deepCustomer.id, month: deepMonth, multiplier: deepMultiplier },
    baseExact,
    baseCalculated,
    base,
    baseGross: roundHalf(mul(rat(base), vat)),
    baseOverridden,
    sale: { cost: saleCost, deepMultiplier: saleDeepMultiplier, baseExact: saleBaseExact, base: saleBase },
    retailProfitPct: retail.profitPct,
    rows,
    issues,
  };
  return { ok: true, list };
}
