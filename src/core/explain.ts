/**
 * "Why this price?" — step-by-step derivation of one row (SPEC.md §6.3).
 * Steps are data; the UI translates `key` (under "breakdown.") and formats `value`.
 */
import { type Rat, ceil, fromBp, isInteger, mul, rat, sub } from './rational';
import { monthDiscountBp, multiplierOf } from './pricing';
import type { Config, IssueParam, PriceList, PriceRow } from './types';

export type StepValue =
  | { money: bigint }
  /** Exact amount, shown with 2 decimals. */
  | { moneyRat: Rat }
  /** Exact amount, shown with 4 decimals (to expose rounding). */
  | { moneyPrecise: Rat }
  | { pct: Rat }
  | { mult: Rat };

export interface Step {
  key: string;
  value?: StepValue;
  params?: Record<string, IssueParam>;
  /** Step is a remark rather than a value in the chain. */
  note?: boolean;
}

function monthParam(config: Config, id: string): IssueParam {
  const def = config.months.find((m) => m.id === id);
  return def ? { text: def.label } : id;
}

export function explainRow(list: PriceList, row: PriceRow, config: Config): Step[] {
  const isSale = row.month === 'sale';
  const steps: Step[] = [
    { key: 'purchaseCost', value: { money: list.input.costGr } },
    {
      key: 'handlingPercent',
      value: { moneyRat: list.handlingPercent },
      params: { pct: { pct: fromBp(config.handling.percentBp) } },
    },
    {
      key: 'fixedHandling',
      value: { money: list.fixedPerUnit },
      params: { total: { money: BigInt(config.handling.fixedGr) }, qty: list.input.qty.toString() },
    },
  ];
  if (!isInteger(list.fixedPerUnitExact)) {
    steps.push({
      key: 'fixedRounded',
      note: true,
      value: { moneyPrecise: sub(rat(list.fixedPerUnit), list.fixedPerUnitExact) },
      params: { exact: { moneyRat: list.fixedPerUnitExact } },
    });
  }
  steps.push({ key: 'unitCost', value: { moneyRat: list.unitCost } });

  let refBase: bigint;
  if (isSale) {
    steps.push(
      { key: 'saleFactor', value: { pct: fromBp(config.sale.factorBp) } },
      { key: 'saleCost', value: { moneyRat: list.sale.cost } },
      { key: 'saleDeepMultiplier', value: { mult: list.sale.deepMultiplier } },
      { key: 'saleBaseExact', value: { moneyPrecise: list.sale.baseExact } },
      { key: list.sale.baseOverridden ? 'saleBaseOverride' : 'saleBase', value: { money: list.sale.base } },
    );
    refBase = row.stale ? list.sale.baseCalculated : list.sale.base;
  } else {
    steps.push(
      {
        key: 'minProfit',
        value: { moneyRat: list.minProfit },
        params: {
          pct: { pct: fromBp(config.minProfit.percentBp) },
          fixed: { money: BigInt(config.minProfit.fixedGr) },
        },
      },
      { key: 'floor', value: { moneyRat: list.floor } },
      {
        key: 'deepMultiplier',
        value: { mult: list.deepest.multiplier },
        params: {
          qty: list.deepest.tier.qty.toString(),
          customer: { text: config.customers.find((cu) => cu.id === list.deepest.customerId)!.label },
          month: monthParam(config, list.deepest.month),
        },
      },
      { key: 'baseExact', value: { moneyPrecise: list.baseExact } },
      { key: list.baseOverridden ? 'baseOverride' : 'base', value: { money: list.base } },
    );
    refBase = row.stale ? list.baseCalculated : list.base;
  }

  const tier = list.tiers.find((t) => t.qty === row.qty)!;
  const customer = config.customers.find((cu) => cu.id === row.customerId)!;
  steps.push(
    { key: 'tierMultiplier', value: { mult: multiplierOf(tier.discountBp) }, params: { qty: row.qty.toString() } },
    {
      key: 'customerMultiplier',
      value: { mult: multiplierOf(customer.discountBp) },
      params: { customer: { text: customer.label } },
    },
  );
  if (!isSale) {
    steps.push({
      key: 'monthMultiplier',
      value: { mult: multiplierOf(monthDiscountBp(config, row.month)) },
      params: { month: monthParam(config, row.month) },
    });
  }
  const netExact = mul(rat(refBase), row.multiplier);
  steps.push({ key: 'netExact', value: { moneyPrecise: netExact } });
  if (row.overridden) {
    steps.push({ key: 'netOverride', value: { money: row.netUnit }, params: { calculated: { money: ceil(netExact) } } });
  } else {
    steps.push({ key: 'netUnit', value: { money: row.netUnit } });
  }
  if (row.stale) steps.push({ key: 'stale', note: true });

  steps.push(
    { key: 'grossUnit', value: { money: row.grossUnit }, params: { vat: { pct: fromBp(config.vatBp) } } },
    { key: 'netTotal', value: { money: row.netTotal }, params: { qty: row.qty.toString() } },
    { key: 'grossTotal', value: { money: row.grossTotal } },
  );
  if (row.grossNotDivisible) {
    steps.push({
      key: 'grossNotDivisible',
      note: true,
      value: { money: row.grossUnit * row.qty },
      params: { diff: { money: row.grossUnit * row.qty - row.grossTotal } },
    });
  }
  steps.push({
    key: 'profitUnit',
    value: { moneyRat: row.profitUnit },
    params: { pct: { pct: row.profitPct } },
  });
  if (row.aboveMax && list.input.maxPriceGr !== undefined) {
    steps.push({
      key: 'aboveMax',
      note: true,
      value: { money: row.netUnit - list.input.maxPriceGr },
      params: { max: { money: list.input.maxPriceGr } },
    });
  }
  if (row.shortfall) {
    steps.push({
      key: isSale ? 'belowSale' : 'belowFloor',
      note: true,
      value: { moneyRat: row.shortfall },
      params: { threshold: { moneyRat: isSale ? list.sale.cost : list.floor } },
    });
  }
  return steps;
}
