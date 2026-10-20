import type { TFunction } from 'i18next';
import type { StepValue } from '../core/explain';
import { type Locale, formatMoney, formatPercent, formatScaled } from '../core/money';
import { type Rat, eq, mul, rat, roundHalf } from '../core/rational';
import { type Config, type CustomerType, type Issue, type IssueParam, SALE } from '../core/types';

const NBSP = ' ';

export function money(gr: bigint, lang: Locale): string {
  return lang === 'pl' ? `${formatMoney(gr, lang)}${NBSP}zł` : `PLN${NBSP}${formatMoney(gr, lang)}`;
}

export const moneyRat = (gr: Rat, lang: Locale) => money(roundHalf(gr), lang);

/** Exact amount with 4 decimals of PLN, to expose rounding. */
export function moneyPrecise(gr: Rat, lang: Locale): string {
  const scaled = roundHalf(mul(gr, rat(100)));
  const exact = eq(rat(scaled, 100), gr);
  const text = formatScaled(scaled, 4, { decimalSep: lang === 'pl' ? ',' : '.', groupSep: lang === 'pl' ? NBSP : ',' });
  const body = lang === 'pl' ? `${text}${NBSP}zł` : `PLN${NBSP}${text}`;
  return exact ? body : `≈${body}`;
}

export function pct(fraction: Rat, lang: Locale): string {
  return lang === 'pl' ? `${formatPercent(fraction, lang)}${NBSP}%` : `${formatPercent(fraction, lang)}%`;
}

/** Multiplier with up to 8 decimals: ×0,55384. */
export function mult(m: Rat, lang: Locale): string {
  const scaled = roundHalf(mul(m, rat(10n ** 8n)));
  const text = formatScaled(scaled, 8, { decimalSep: lang === 'pl' ? ',' : '.', trim: true });
  return `${eq(rat(scaled, 10n ** 8n), m) ? '' : '≈'}×${text}`;
}

export function formatParam(p: IssueParam, lang: Locale, t: TFunction): string {
  if (typeof p === 'string' || typeof p === 'number') return String(p);
  if ('money' in p) return money(p.money, lang);
  if ('moneyRat' in p) return moneyRat(p.moneyRat, lang);
  if ('pct' in p) return pct(p.pct, lang);
  if ('text' in p) return p.text[lang];
  return t(p.key);
}

export function formatParams(params: Issue['params'], lang: Locale, t: TFunction): Record<string, string> {
  return Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, formatParam(v, lang, t)]));
}

export function formatStepValue(v: StepValue, lang: Locale): string {
  if ('money' in v) return money(v.money, lang);
  if ('moneyRat' in v) return moneyRat(v.moneyRat, lang);
  if ('moneyPrecise' in v) return moneyPrecise(v.moneyPrecise, lang);
  if ('pct' in v) return pct(v.pct, lang);
  return mult(v.mult, lang);
}

export function issueMessage(issue: Issue, lang: Locale, t: TFunction): string {
  return t(`issues.${issue.code}`, formatParams(issue.params, lang, t));
}

export function customerLabel(customers: CustomerType[], id: string, lang: Locale): string {
  return customers.find((c) => c.id === id)?.label[lang] ?? id;
}

/** Name of a month type id in the UI language (the sale type is built in). */
export function monthLabel(config: Config, id: string, lang: Locale, t: TFunction): string {
  if (id === SALE) return t('months.sale');
  return config.months.find((m) => m.id === id)?.label[lang] ?? id;
}

/** DOM id of the input editing a config/input path ("packages.2.qty" → "field-packages-2-qty"). */
export const fieldId = (path: string) => `field-${path.replace(/\./g, '-')}`;
