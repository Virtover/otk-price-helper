import type { Rat } from './rational';

/** All config numbers are integers: money in grosze, percents/multipliers in basis points. */
export interface PackageTier {
  qty: number;
  discountBp: number;
}

export interface CustomerType {
  id: string;
  label: { pl: string; en: string };
  discountBp: number;
}

/** Regular month type (peak, pre-peak, …) — user-defined. */
export interface MonthTypeDef {
  id: string;
  label: { pl: string; en: string };
  discountBp: number;
}

/** The sale month type is built in: it is priced from cost, not from the base price. */
export const SALE = 'sale';

/** Id of a regular month type, or SALE. */
export type MonthType = string;

/** How package and customer discounts are given: % of the price, or PLN amounts (SPEC §5.4). */
export type DiscountMode = 'percent' | 'amount';

export interface Config {
  schemaVersion: 4;
  handling: { percentBp: number; fixedGr: number };
  minProfit: { percentBp: number; fixedGr: number };
  vatBp: number;
  /** Costs proportional to the selling price (marketplace / payment fees), % of the GROSS price. */
  fees: { percentBp: number };
  packages: PackageTier[];
  customers: CustomerType[];
  /** Regular month types in display order. */
  months: MonthTypeDef[];
  /** Sale price factor applied to unit cost K (10000 = 100 % = sell at cost). */
  sale: { factorBp: number };
  /** Month type id (or SALE) for each calendar month, January first. */
  calendar: MonthType[];
  /** Package × customer discounts in %, or as one matrix of PLN amounts shared by all month types. */
  discountMode: DiscountMode;
  ui: { discountInput: 'percent' | 'multiplier' };
}

export interface ProductInput {
  name: string;
  /** Net purchase cost per unit, grosze. */
  costGr: bigint;
  /** Quantity bought by the shop. */
  qty: bigint;
  /** Optional upper limit for the net unit price; rows above it are flagged. */
  maxPriceGr?: bigint;
}

export type IssueLevel = 'error' | 'warning' | 'info';

export type IssueParam =
  | string
  | number
  | { money: bigint }
  | { moneyRat: Rat }
  | { pct: Rat }
  /** Text in both languages (e.g. a customer label). */
  | { text: { pl: string; en: string } }
  /** i18n key to translate (e.g. "months.pre1"). */
  | { key: string };

export interface Issue {
  level: IssueLevel;
  /** i18n key under "issues." */
  code: string;
  params?: Record<string, IssueParam>;
  /** Field the user should change, e.g. "packages.2.discountBp" or "input.costGr". */
  path?: string;
}

export interface Overrides {
  /** Manually set base price B (net, grosze). */
  base?: bigint;
  /** Manually set sale base (net, grosze). */
  saleBase?: bigint;
  /** Flexible mode: raised bottom of the regular spread (deepest price), grosze. */
  flexLow?: bigint;
  /** Flexible mode: raised bottom of the sale spread, grosze. */
  flexSaleLow?: bigint;
  /** Manually set net unit price per row key. */
  rows: Record<string, bigint>;
}

export type RowStatus = 'ok' | 'anchor' | 'sale' | 'override' | 'error';

export interface PriceRow {
  key: string;
  /** Package quantity (1 for the implicit single-unit tier). */
  qty: bigint;
  customerId: string;
  month: MonthType;
  /**
   * Combined nominal price multiplier. Amount mode: the row's price at the calculated base
   * divided by that base (its position used by shifting and the flexible price list).
   */
  multiplier: Rat;
  /** Month type multiplier (1 for sale). */
  monthMultiplier: Rat;
  /** Amount mode: PLN discount of this package × customer, net per unit, grosze. */
  amountGr?: bigint;
  netUnit: bigint;
  /** Net unit price without this row's own manual edit. */
  calculatedNet: bigint;
  grossUnit: bigint;
  netTotal: bigint;
  grossTotal: bigint;
  /** gross_total ≠ gross_unit · qty (VAT is computed on the net total). */
  grossNotDivisible: boolean;
  profitUnit: Rat;
  profitTotal: Rat;
  /** Markup: profit per unit as a fraction of purchase cost. */
  profitPct: Rat;
  /** Margin: profit per unit as a fraction of the net price. */
  marginPct: Rat;
  nominalDiscount: Rat;
  effectiveDiscount: Rat;
  status: RowStatus;
  overridden: boolean;
  /** Derived columns not recomputed after a manual edit (smart updates off). */
  stale: boolean;
  /** Below floor (regular) or below sale price (sale): missing amount per unit, grosze. */
  shortfall?: Rat;
  /** Net unit price exceeds the optional maximum price from the input. */
  aboveMax: boolean;
  /** Fees taken from this unit's selling price (exact, grosze). */
  feeUnit: Rat;
  /** Price was spread between minimum and maximum by the flexible mode. */
  flexed: boolean;
}

export interface AmountCell {
  /** Amount used, grosze. */
  gr: bigint;
  /** Amount generated from the configured % discounts. */
  auto: bigint;
  manual: boolean;
}

/** Amount mode: one PLN amount per package × customer (key `qty|customerId`), the same in every month type. */
export interface AmountMatrix {
  /** Peak (dearest regular) month type: generated amounts are its retail price × the configured discounts. */
  refMonth: MonthType;
  /** Retail price of refMonth at the base the generated amounts lead to, grosze. */
  refRetail: bigint;
  /** False when no base fits peak-based amounts: refRetail is then the peak price at the percent-mode base. */
  settled: boolean;
  cells: Record<string, AmountCell>;
  /** Largest amount (the deepest combination). */
  max: bigint;
}

export interface Tier {
  qty: bigint;
  discountBp: number;
  implicit: boolean;
}

export interface PriceList {
  input: ProductInput;
  /** Percent handling per unit (exact). */
  handlingPercent: Rat;
  /** Fixed handling per unit before rounding (exact H/N). */
  fixedPerUnitExact: Rat;
  /** Fixed handling per unit rounded up to the grosz. */
  fixedPerUnit: bigint;
  unitCost: Rat;
  minProfit: Rat;
  floor: Rat;
  tiers: Tier[];
  deepest: { tier: Tier; customerId: string; month: MonthType; multiplier: Rat };
  baseExact: Rat;
  baseCalculated: bigint;
  /** Base actually used (override or calculated). */
  base: bigint;
  baseGross: bigint;
  baseOverridden: boolean;
  sale: {
    cost: Rat;
    deepMultiplier: Rat;
    baseExact: Rat;
    baseCalculated: bigint;
    /** Base actually used (override or calculated). */
    base: bigint;
    baseOverridden: boolean;
  };
  /** Amount mode only. */
  amounts?: AmountMatrix;
  /** Fee as a fraction of the NET price (fee % · (1 + VAT)) and the share the shop keeps (1 − rate). */
  fees: { rate: Rat; keep: Rat };
  /**
   * Flexible mode: when the discounts cannot fit under the maximum price, regular (and/or sale)
   * prices are spread linearly between the minimum price and the maximum price.
   */
  /** top / saleTop: the lower of the price limit and the base (sale base) actually used. */
  /** saleRatio: B_sale / B without flexibility; in flexible mode saleTop = ⌈top · saleRatio⌉ (linked). */
  flex: {
    requested: boolean;
    active: boolean;
    saleActive: boolean;
    top: bigint;
    saleTop: bigint;
    saleRatio: Rat;
    /** Bottom of the spread: the minimum price, or higher after an edit towards the limit. */
    low: Rat;
    saleLow: Rat;
    lowRaised: boolean;
    saleLowRaised: boolean;
  };
  /** Highest regular price actually used: the flexible top when flex is active, else the base price. */
  topPrice: bigint;
  topPriceGross: bigint;
  /** Markup of the base price row (1 unit · first customer · first month): profit / purchase cost. */
  retailProfitPct: Rat;
  /** Margin of the same row: profit / net price. */
  retailMarginPct: Rat;
  /** Key of that row. */
  retailKey: string;
  rows: PriceRow[];
  issues: Issue[];
}

export type PriceResult = { ok: true; list: PriceList } | { ok: false; issues: Issue[] };
