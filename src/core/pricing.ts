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
  floor as floorOf,
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
  RowStatus,
  Tier,
} from './types';
import { SALE } from './types';
import { MAX_COST_GR, hasErrors, validateConfig, validateInput } from './validate';

/** Largest supported unit price: 10 000 000 PLN. */
export const MAX_PRICE_GR = MAX_COST_GR;

export const rowKey = (qty: bigint, customerId: string, month: MonthType) => `${qty}|${customerId}|${month}`;

/** Discount in bp → price multiplier (500 bp → 0.95). */
export const multiplierOf = (discountBp: number): Rat => sub(ONE, fromBp(discountBp));

export function monthDiscountBp(config: Config, month: MonthType): number {
  return config.months.find((m) => m.id === month)?.discountBp ?? 0;
}

/** Regular month type ids followed by the sale type, in display order. */
export const monthIds = (config: Config): MonthType[] => [...config.months.map((m) => m.id), SALE];

/** Element with the largest key; on ties the last one wins (deeper in the ladder). */
function deepestBy<T>(items: readonly T[], key: (t: T) => number): T {
  return items.reduce((best, cur) => (key(cur) >= key(best) ? cur : best));
}

/**
 * Smallest base B (grosze) for which ⌈B · m⌉ equals the target exactly.
 * Every integer target is reachable because m ≤ 1 makes ⌈B · m⌉ grow by at most 1 per step.
 */
export function baseForTarget(target: bigint, multiplier: Rat): bigint {
  return floorOf(div(rat(target - 1n), multiplier)) + 1n;
}

/**
 * Overrides that move a row to the target price by shifting its base, so all
 * other rows sharing that base follow according to their discounts. Sale rows
 * shift the sale base; regular rows shift B. The row's own manual edit is dropped.
 *
 * With the flexible price list on (pass the current list), a base too low for the full
 * discounts makes the prices spread; the new top is then chosen so the spread puts this
 * row exactly on the target. Where no top can do that (the deepest row, or a top above the
 * price limit), the edit falls back to this row only.
 */
export function shiftOverrides(row: PriceRow, target: bigint, overrides: Overrides, list?: PriceList): Overrides {
  const { [row.key]: _dropped, ...rows } = overrides.rows;
  const isSale = row.month === SALE;
  const individually = { ...overrides, rows: { ...rows, [row.key]: target } };
  if (isSale && list?.flex.requested) return shiftLinkedSale(row, target, overrides, rows, list) ?? individually;
  let base = baseForTarget(target, row.multiplier);
  if (list?.flex.requested) {
    const needed = isSale ? list.sale.baseCalculated : list.baseCalculated;
    if (base < needed) {
      const low = isSale ? list.sale.cost : list.floor;
      const pos = flexPosition(isSale ? list.sale.deepMultiplier : list.deepest.multiplier, row.multiplier);
      if (pos.n === 0n) return individually;
      // Smallest top T with ⌈low + (T − low) · pos⌉ = target (pos ≤ 1, so every target is reachable).
      base = floorOf(add(low, div(sub(rat(target - 1n), low), pos))) + 1n;
      const max = list.input.maxPriceGr;
      if (max !== undefined && base > max) return individually;
    }
  }
  return isSale ? { ...overrides, rows, saleBase: base } : { ...overrides, rows, base };
}

/**
 * Flexible mode, sale row: find the sale top that puts the row on the target (nominal or spread),
 * then the regular base whose linked sale top is exactly that. Undefined = not reachable.
 */
function shiftLinkedSale(
  row: PriceRow,
  target: bigint,
  overrides: Overrides,
  rows: Record<string, bigint>,
  list: PriceList,
): Overrides | undefined {
  let saleTop = baseForTarget(target, row.multiplier);
  if (saleTop < list.sale.baseCalculated) {
    const pos = flexPosition(list.sale.deepMultiplier, row.multiplier);
    if (pos.n === 0n) return undefined;
    saleTop = floorOf(add(list.sale.cost, div(sub(rat(target - 1n), list.sale.cost), pos))) + 1n;
  }
  if (gt(list.flex.saleRatio, ONE)) return undefined;
  const base = baseForTarget(saleTop, list.flex.saleRatio);
  const max = list.input.maxPriceGr;
  if (max !== undefined && base > max) return undefined;
  const { saleBase: _ignored, ...rest } = overrides;
  return { ...rest, rows, base };
}

export interface CalculateOptions {
  /** Recompute derived columns of edited rows (default true). */
  smartUpdates?: boolean;
  /** Spread prices between minimum and maximum price when discounts cannot fit under the maximum (default false). */
  flexible?: boolean;
}

/**
 * Flexible pricing: the price at nominal multiplier m placed linearly between `low`
 * (the deepest multiplier mDeep) and `top` (no discount). Exact; caller rounds up.
 */
export function spreadPrice(low: Rat, top: bigint, mDeep: Rat, m: Rat): Rat {
  if (eq(mDeep, ONE)) return rat(top);
  return add(low, mul(sub(rat(top), low), flexPosition(mDeep, m)));
}

/** Position of multiplier m between the deepest combination (0) and no discount (1). */
export function flexPosition(mDeep: Rat, m: Rat): Rat {
  return eq(mDeep, ONE) ? ONE : div(sub(m, mDeep), sub(ONE, mDeep));
}

export function calculate(
  input: ProductInput,
  config: Config,
  overrides: Overrides = { rows: {} },
  options: CalculateOptions = {},
): PriceResult {
  const smart = options.smartUpdates ?? true;
  const flexible = options.flexible ?? false;
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

  // 2. Floor F = (K + c·p% + P) / (1 − fee·(1+VAT)): the fee is a share of the gross selling price,
  //    so the shop keeps `keep` of every net złoty and the floor must cover cost + profit after fees.
  const minProfit = add(mul(c, fromBp(config.minProfit.percentBp)), rat(config.minProfit.fixedGr));
  const feeRate = mul(fromBp(config.fees.percentBp), vat);
  const keep = sub(ONE, feeRate);
  const floor = div(add(unitCost, minProfit), keep);

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
  const deepMonth = deepestBy(config.months, (m) => m.discountBp).id;
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

  // 5. Sale: deepest package × customer combination priced at s·K (after fees).
  const saleCost = div(mul(unitCost, fromBp(config.sale.factorBp)), keep);
  const saleDeepMultiplier = mul(multiplierOf(deepTier.discountBp), multiplierOf(deepCustomer.discountBp));
  const saleBaseExact = div(saleCost, saleDeepMultiplier);
  const saleBaseCalculated = ceil(saleBaseExact);
  const saleBaseOverridden = overrides.saleBase !== undefined;
  const saleBase = overrides.saleBase ?? saleBaseCalculated;

  // 6. Flexible mode. The top price is the lower of the price limit and the base actually used
  //    (a manually lowered base counts too). When it is below the base the full discounts need,
  //    prices are spread between the floor and that top — if the top still allows the floor.
  const max = input.maxPriceGr;
  const baseUsed = smart ? base : baseCalculated;
  const saleUsed = smart ? saleBase : saleBaseCalculated;
  const topOf = (used: bigint) => (max !== undefined && max < used ? max : used);
  const regularTop = topOf(baseUsed);
  // In flexible mode sale prices are linked to regular ones: the sale top keeps the same ratio to
  // the regular top as without flexibility (B_sale / B), so a change of one moves the other.
  const saleRatio = div(rat(saleBaseCalculated), rat(baseCalculated));
  // The linked sale top never goes below the sale price itself (cost × sale factor after fees).
  const linkedSaleTop = topOf(ceil(mul(rat(regularTop), saleRatio)));
  const saleFloor = ceil(saleCost);
  const saleTop = flexible ? (linkedSaleTop < saleFloor ? saleFloor : linkedSaleTop) : topOf(saleUsed);
  const canSpread = (top: bigint, needed: bigint, low: Rat) => top < needed && !lt(rat(top), low);
  const flexActive = flexible && canSpread(regularTop, baseCalculated, floor);
  const saleFlexActive = flexible && canSpread(saleTop, saleBaseCalculated, saleCost);

  // 7. Rows.
  const rows: PriceRow[] = [];
  for (const tier of tiers) {
    for (const customer of config.customers) {
      for (const month of monthIds(config)) {
        const isSale = month === SALE;
        const parts = [multiplierOf(tier.discountBp), multiplierOf(customer.discountBp)];
        if (!isSale) parts.push(multiplierOf(monthDiscountBp(config, month)));
        const multiplier = product(parts);
        const key = rowKey(tier.qty, customer.id, month);

        // With smart updates off the derived columns keep their pre-edit values.
        const flexed = isSale ? saleFlexActive : flexActive;
        const saleRef = flexible ? saleTop : saleUsed;
        const refBase = flexed ? (isSale ? saleTop : regularTop) : isSale ? saleRef : baseUsed;
        const exactNet = flexed
          ? spreadPrice(isSale ? saleCost : floor, refBase, isSale ? saleDeepMultiplier : deepMultiplier, multiplier)
          : mul(rat(refBase), multiplier);
        const calculatedNet = ceil(exactNet);
        const overrideNet = overrides.rows[key];
        const shownNet = overrideNet ?? calculatedNet;
        const derivedNet = smart ? shownNet : calculatedNet;
        const stale =
          !smart &&
          (overrideNet !== undefined || (isSale && !flexible ? saleBaseOverridden : baseOverridden));

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
        const feeUnit = mul(rat(derivedNet), feeRate);
        const profitUnit = sub(mul(rat(derivedNet), keep), unitCost);

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
          aboveMax: max !== undefined && shownNet > max,
          feeUnit,
          flexed,
        });
      }
    }
  }

  // 8. Result-level feedback.
  if (gt(rat(fixedPerUnit), c)) {
    issues.push({
      level: 'warning',
      code: 'fixedHandlingDominates',
      params: { share: { pct: div(rat(fixedPerUnit), unitCost) }, perUnit: { money: fixedPerUnit } },
      path: 'input.qty',
    });
  }
  // Reference row: single unit, first customer type, first month type (normally the peak).
  const retail = rows.find(
    (r) => r.qty === 1n && r.customerId === config.customers[0]!.id && r.month === config.months[0]!.id,
  )!;
  if (gt(retail.profitPct, ONE)) {
    issues.push({ level: 'info', code: 'retailProfitHigh', params: { pct: { pct: retail.profitPct } } });
  }
  if (config.sale.factorBp < 10000) {
    issues.push({
      level: 'warning',
      code: 'saleBelowCost',
      params: { loss: { moneyRat: sub(unitCost, mul(saleCost, keep)) } },
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
  if (input.maxPriceGr !== undefined) {
    const max = { money: input.maxPriceGr };
    if (lt(rat(input.maxPriceGr), floor)) {
      issues.push({ level: 'warning', code: 'maxBelowFloor', params: { max, floor: { moneyRat: floor } }, path: 'input.maxPriceGr' });
    }
    const above = rows.filter((r) => r.aboveMax).length;
    if (above > 0) {
      issues.push({ level: 'warning', code: 'rowsAboveMax', params: { count: above, max }, path: 'input.maxPriceGr' });
    }
  }
  if (flexActive) {
    issues.push({
      level: 'info',
      code: 'flexActive',
      params: { base: { money: baseCalculated }, max: { money: regularTop } },
    });
  }
  if (saleFlexActive) {
    issues.push({ level: 'info', code: 'flexSaleActive', params: { max: { money: saleTop } } });
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
    sale: {
      cost: saleCost,
      deepMultiplier: saleDeepMultiplier,
      baseExact: saleBaseExact,
      baseCalculated: saleBaseCalculated,
      base: saleBase,
      baseOverridden: saleBaseOverridden,
    },
    fees: { rate: feeRate, keep },
    flex: { requested: flexible, active: flexActive, saleActive: saleFlexActive, top: regularTop, saleTop, saleRatio },
    topPrice: flexActive ? regularTop : baseUsed,
    topPriceGross: roundHalf(mul(rat(flexActive ? regularTop : baseUsed), vat)),
    retailProfitPct: retail.profitPct,
    rows,
    issues,
  };
  return { ok: true, list };
}
