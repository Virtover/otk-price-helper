import { describe, expect, it } from 'vitest';
import {
  formatBpInput,
  formatMoney,
  formatMoneyInput,
  formatMoneyRat,
  formatMultiplierInput,
  formatPercent,
  parseInteger,
  parseMoney,
  parseMultiplierBp,
  parsePercentBp,
} from '../../src/core/money';
import { rat } from '../../src/core/rational';

describe('parsing', () => {
  it('accepts both decimal separators and spaces', () => {
    expect(parseMoney('12,50')).toEqual({ ok: true, value: 1250n });
    expect(parseMoney('12.5')).toEqual({ ok: true, value: 1250n });
    expect(parseMoney(' 1 234,05 ')).toEqual({ ok: true, value: 123405n });
    expect(parseMoney('1 234')).toEqual({ ok: true, value: 123400n });
    expect(parseMoney(',5')).toEqual({ ok: true, value: 50n });
    expect(parseMoney('7,')).toEqual({ ok: true, value: 700n });
  });

  it('accepts trailing zeros beyond precision', () => {
    expect(parseMoney('12,500')).toEqual({ ok: true, value: 1250n });
  });

  it('reports precise errors', () => {
    expect(parseMoney('')).toEqual({ ok: false, error: 'empty' });
    expect(parseMoney('abc')).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('1,2,3')).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('1.234,50')).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney(',')).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('12,345')).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseMoney('-5')).toEqual({ ok: false, error: 'negative' });
    expect(parseMoney('-0')).toEqual({ ok: true, value: 0n });
  });

  it('parses percents, multipliers and integers', () => {
    expect(parsePercentBp('2,5')).toEqual({ ok: true, value: 250n });
    expect(parsePercentBp('0,005')).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseMultiplierBp('0,95')).toEqual({ ok: true, value: 9500n });
    expect(parseMultiplierBp('0,33333')).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseInteger('1 000')).toEqual({ ok: true, value: 1000n });
    expect(parseInteger('10,5')).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('formatting', () => {
  it('formats money per locale', () => {
    expect(formatMoney(123450n, 'pl')).toBe('1234,50');
    expect(formatMoney(1234550n, 'pl')).toBe('12 345,50');
    expect(formatMoney(123450n, 'en')).toBe('1,234.50');
    expect(formatMoney(-5n, 'en')).toBe('-0.05');
  });

  it('formats exact amounts rounded half-up', () => {
    expect(formatMoneyRat(rat(2511, 2), 'pl')).toBe('12,56');
    expect(formatMoneyRat(rat(-1, 2), 'en')).toBe('-0.01');
  });

  it('formats percents', () => {
    expect(formatPercent(rat(1, 8), 'pl')).toBe('12,50');
    expect(formatPercent(rat(1107, 1000), 'en')).toBe('110.70');
  });

  it('formats input values minimally', () => {
    expect(formatBpInput(250, 'pl')).toBe('2,5');
    expect(formatBpInput(1000, 'en')).toBe('10');
    expect(formatMultiplierInput(9500, 'pl')).toBe('0,95');
    expect(formatMultiplierInput(10000, 'en')).toBe('1');
    expect(formatMoneyInput(50000, 'pl')).toBe('500');
    expect(formatMoneyInput(1250, 'pl')).toBe('12,50');
  });
});
