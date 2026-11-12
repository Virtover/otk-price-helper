import { rowKey } from './pricing';
import { type Rat, rat } from './rational';
import type { Config, MonthType, PriceList } from './types';

/**
 * Discounts as a customer sees them: relative to the retail price of the same month type
 * (1 unit · first customer type · that month), not to the base price.
 */
export interface MonthRetail {
  month: MonthType;
  /** Unit price of 1 unit for the first customer type in this month, net and gross. */
  net: bigint;
  gross: bigint;
  /** Top (base) price − retail price, net per unit; negative when the retail price is above it. */
  belowTop: bigint;
  /** belowTop as a fraction of the top price. */
  belowTopPct: Rat;
}

export interface RetailDiscount {
  /** Retail price − price, per unit; negative when the price is above the retail price. */
  net: bigint;
  /** Same in gross prices (undefined when no gross price is known). */
  gross?: bigint;
  /** Net discount as a fraction of the net retail price. */
  pct: Rat;
}

export function monthRetail(list: PriceList, config: Config, month: MonthType): MonthRetail {
  const key = rowKey(1n, config.customers[0]!.id, month);
  const retail = list.rows.find((r) => r.key === key)!;
  const belowTop = list.topPrice - retail.netUnit;
  return { month, net: retail.netUnit, gross: retail.grossUnit, belowTop, belowTopPct: rat(belowTop, list.topPrice) };
}

export function retailDiscount(retail: MonthRetail, netUnit: bigint, grossUnit?: bigint): RetailDiscount {
  const net = retail.net - netUnit;
  return { net, gross: grossUnit === undefined ? undefined : retail.gross - grossUnit, pct: rat(net, retail.net) };
}
