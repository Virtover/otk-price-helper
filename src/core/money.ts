/**
 * Parsing and formatting of fixed-point decimals (money in grosze, percents in
 * basis points, multipliers in 1/10000). All conversions are exact.
 */
import { type Rat, mul, rat, roundHalf } from './rational';

export type Locale = 'pl' | 'en';

export type ParseError = 'empty' | 'invalid' | 'tooManyDecimals' | 'negative';
export type ParseResult = { ok: true; value: bigint } | { ok: false; error: ParseError };

const WHITESPACE = /[\s  ]/g;

/**
 * Parses "1 234,5" / "1234.50" into an integer scaled by 10^decimals.
 * Both decimal separators are accepted regardless of UI language.
 */
export function parseScaled(input: string, decimals: number): ParseResult {
  let s = input.replace(WHITESPACE, '');
  if (s === '') return { ok: false, error: 'empty' };
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { ok: false, error: 'invalid' };
  const intPart = m[1] || '0';
  let frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > decimals) return { ok: false, error: 'tooManyDecimals' };
  frac = frac.padEnd(decimals, '0');
  const value = BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac || '0');
  if (negative && value !== 0n) return { ok: false, error: 'negative' };
  return { ok: true, value };
}

/** "12,50" → 1250 grosze. */
export const parseMoney = (s: string) => parseScaled(s, 2);
/** "2,5" (%) → 250 bp. */
export const parsePercentBp = (s: string) => parseScaled(s, 2);
/** "0,95" (×) → 9500 bp. */
export const parseMultiplierBp = (s: string) => parseScaled(s, 4);

/** Parses a whole number ("1 000" → 1000). */
export function parseInteger(input: string): ParseResult {
  const r = parseScaled(input, 0);
  if (!r.ok && r.error === 'tooManyDecimals') return { ok: false, error: 'invalid' };
  return r;
}

const SEPARATORS: Record<Locale, { decimal: string; group: string; minGroupDigits: number }> = {
  pl: { decimal: ',', group: ' ', minGroupDigits: 5 },
  en: { decimal: '.', group: ',', minGroupDigits: 4 },
};

function groupDigits(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export interface FormatOptions {
  decimalSep: string;
  /** Omit for no digit grouping (CSV). */
  groupSep?: string;
  minGroupDigits?: number;
  /** Strip trailing fractional zeros ("10,00" → "10"). */
  trim?: boolean;
}

export function formatScaled(value: bigint, decimals: number, opts: FormatOptions): string {
  const negative = value < 0n;
  const absValue = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  let intPart = (absValue / scale).toString();
  let frac = decimals > 0 ? (absValue % scale).toString().padStart(decimals, '0') : '';
  if (opts.trim) frac = frac.replace(/0+$/, '');
  if (opts.groupSep !== undefined && intPart.length >= (opts.minGroupDigits ?? 4)) {
    intPart = groupDigits(intPart, opts.groupSep);
  }
  return (negative ? '-' : '') + intPart + (frac ? opts.decimalSep + frac : '');
}

function localeOpts(locale: Locale): FormatOptions {
  const s = SEPARATORS[locale];
  return { decimalSep: s.decimal, groupSep: s.group, minGroupDigits: s.minGroupDigits };
}

/** 123450 grosze → "1 234,50" (pl) / "1,234.50" (en). */
export function formatMoney(gr: bigint, locale: Locale): string {
  return formatScaled(gr, 2, localeOpts(locale));
}

/** Exact amount in PLN (Rat of grosze) rounded half-up to the grosz for display. */
export function formatMoneyRat(gr: Rat, locale: Locale): string {
  return formatMoney(roundHalf(gr), locale);
}

/** Fraction → percent with 2 decimals: 1/8 → "12,50". */
export function formatPercent(fraction: Rat, locale: Locale): string {
  return formatScaled(roundHalf(mul(fraction, rat(10000))), 2, localeOpts(locale));
}

/** Basis points for an input field, minimal decimals: 250 → "2,5". */
export function formatBpInput(bp: number, locale: Locale): string {
  return formatScaled(BigInt(bp), 2, { decimalSep: SEPARATORS[locale].decimal, trim: true });
}

/** Multiplier basis points for an input field: 9500 → "0,95". */
export function formatMultiplierInput(bp: number, locale: Locale): string {
  return formatScaled(BigInt(bp), 4, { decimalSep: SEPARATORS[locale].decimal, trim: true });
}

/** Grosze for an input field: 50000 → "500", 1250 → "12,50". */
export function formatMoneyInput(gr: number | bigint, locale: Locale): string {
  const value = BigInt(gr);
  if (value % 100n === 0n) return (value / 100n).toString();
  return formatScaled(value, 2, { decimalSep: SEPARATORS[locale].decimal });
}
