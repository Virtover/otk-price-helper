import { type Config, type Issue, type IssueParam, type ProductInput, SALE } from './types';

export const MAX_COST_GR = 1_000_000_000n; // 10 000 000 PLN
export const MAX_QTY = 10_000_000n;
export const MAX_PERCENT_BP = 100_000; // 1000 %
export const USUAL_VAT_BP = [0, 500, 800, 2300];

const isInt = (v: number) => Number.isSafeInteger(v);

function discountIssues(bp: number, path: string): Issue[] {
  if (!isInt(bp)) return [{ level: 'error', code: 'invalidNumber', path }];
  if (bp < 0) return [{ level: 'error', code: 'discountNegative', path }];
  if (bp >= 10000) return [{ level: 'error', code: 'discountTooHigh', path }];
  return [];
}

function nonNegative(value: number, path: string, maxValue: number): Issue[] {
  if (!isInt(value)) return [{ level: 'error', code: 'invalidNumber', path }];
  if (value < 0) return [{ level: 'error', code: 'negativeValue', path }];
  if (value > maxValue) return [{ level: 'error', code: 'valueTooHigh', path }];
  return [];
}

interface LadderStep {
  bp: number;
  path: string;
  name: IssueParam;
}

/**
 * A discount ladder must not decrease from one step to the next.
 * Decrease → `<code>Error`, equal neighbours → `<code>Equal` warning.
 */
function ladderIssues(steps: LadderStep[], code: string): Issue[] {
  const issues: Issue[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    const params = { a: prev.name, b: cur.name };
    if (cur.bp < prev.bp) issues.push({ level: 'error', code: `${code}Error`, params, path: cur.path });
    else if (cur.bp === prev.bp) issues.push({ level: 'warning', code: `${code}Equal`, params, path: cur.path });
  }
  return issues;
}

export function validateConfig(config: Config): Issue[] {
  const maxMoney = Number(MAX_COST_GR);
  const issues: Issue[] = [
    ...nonNegative(config.handling.percentBp, 'handling.percentBp', MAX_PERCENT_BP),
    ...nonNegative(config.handling.fixedGr, 'handling.fixedGr', maxMoney),
    ...nonNegative(config.minProfit.percentBp, 'minProfit.percentBp', MAX_PERCENT_BP),
    ...nonNegative(config.minProfit.fixedGr, 'minProfit.fixedGr', maxMoney),
  ];

  if (!isInt(config.vatBp) || config.vatBp < 0 || config.vatBp > 10000) {
    issues.push({ level: 'error', code: 'vatRange', path: 'vatBp' });
  } else if (!USUAL_VAT_BP.includes(config.vatBp)) {
    issues.push({ level: 'warning', code: 'vatUnusual', path: 'vatBp' });
  }

  // Package tiers: valid quantities, no duplicates, discount grows with quantity.
  const seen = new Set<number>();
  config.packages.forEach((p, i) => {
    const path = `packages.${i}.qty`;
    if (!isInt(p.qty) || p.qty < 2 || p.qty > Number(MAX_QTY)) {
      issues.push({ level: 'error', code: 'tierQtyInvalid', path });
    } else if (seen.has(p.qty)) {
      issues.push({ level: 'error', code: 'tierDuplicate', params: { qty: p.qty }, path });
    }
    seen.add(p.qty);
    issues.push(...discountIssues(p.discountBp, `packages.${i}.discountBp`));
  });
  const byQty = config.packages.map((p, i) => ({ ...p, i })).sort((a, b) => a.qty - b.qty);
  issues.push(
    ...ladderIssues(
      byQty.map((p) => ({ bp: p.discountBp, path: `packages.${p.i}.discountBp`, name: p.qty })),
      'tierOrder',
    ),
  );

  // Customer types: listed from smallest to largest discount.
  if (config.customers.length === 0) {
    issues.push({ level: 'error', code: 'customerNone', path: 'customers' });
  }
  const ids = new Set<string>();
  config.customers.forEach((c, i) => {
    const path = `customers.${i}.label`;
    if (ids.has(c.id)) issues.push({ level: 'error', code: 'customerDuplicateId', path });
    ids.add(c.id);
    if (!c.label.pl.trim() || !c.label.en.trim()) issues.push({ level: 'error', code: 'customerLabelEmpty', path });
    issues.push(...discountIssues(c.discountBp, `customers.${i}.discountBp`));
  });
  issues.push(
    ...ladderIssues(
      config.customers.map((c, i) => ({ bp: c.discountBp, path: `customers.${i}.discountBp`, name: { text: c.label } })),
      'customerOrder',
    ),
  );

  // Month types: free names and order (several peaks may share a discount), unique ids.
  if (config.months.length === 0) {
    issues.push({ level: 'error', code: 'monthNone', path: 'months' });
  }
  const monthIds = new Set<string>([SALE]);
  config.months.forEach((m, i) => {
    const path = `months.${i}.label`;
    if (monthIds.has(m.id)) issues.push({ level: 'error', code: 'monthDuplicateId', path });
    monthIds.add(m.id);
    if (!m.label.pl.trim() || !m.label.en.trim()) issues.push({ level: 'error', code: 'monthLabelEmpty', path });
    issues.push(...discountIssues(m.discountBp, `months.${i}.discountBp`));
  });
  config.calendar.forEach((m, i) => {
    if (!monthIds.has(m)) issues.push({ level: 'error', code: 'calendarUnknown', path: `calendar.${i}` });
  });

  if (!isInt(config.sale.factorBp) || config.sale.factorBp <= 0 || config.sale.factorBp > MAX_PERCENT_BP) {
    issues.push({ level: 'error', code: 'saleFactorRange', path: 'sale.factorBp' });
  }

  return issues;
}

export function validateInput(input: ProductInput): Issue[] {
  const issues: Issue[] = [];
  if (input.costGr <= 0n) issues.push({ level: 'error', code: 'costNonPositive', path: 'input.costGr' });
  else if (input.costGr > MAX_COST_GR) issues.push({ level: 'error', code: 'valueTooHigh', path: 'input.costGr' });
  if (input.qty < 1n) issues.push({ level: 'error', code: 'qtyNonPositive', path: 'input.qty' });
  else if (input.qty > MAX_QTY) issues.push({ level: 'error', code: 'valueTooHigh', path: 'input.qty' });
  if (input.maxPriceGr !== undefined && input.maxPriceGr <= 0n) {
    issues.push({ level: 'error', code: 'maxPriceNonPositive', path: 'input.maxPriceGr' });
  }
  return issues;
}

export const hasErrors = (issues: readonly Issue[]) => issues.some((i) => i.level === 'error');
