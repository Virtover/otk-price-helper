import { describe, expect, it } from 'vitest';
import { hasErrors, validateConfig, validateInput } from '../../src/core/validate';
import type { Config } from '../../src/core/types';
import { config, input } from './helpers';

const issuesOf = (patch: (c: Config) => void) => validateConfig(config(patch));
const find = (patch: (c: Config) => void, code: string) => issuesOf(patch).filter((i) => i.code === code);

describe('validateConfig', () => {
  it('accepts the defaults without any issue', () => {
    expect(validateConfig(config())).toEqual([]);
  });

  it('errors when a larger package has a smaller discount', () => {
    const [issue] = find((c) => (c.packages[3]!.discountBp = 500), 'tierOrderError');
    expect(issue).toMatchObject({ level: 'error', path: 'packages.3.discountBp', params: { a: 200, b: 300 } });
  });

  it('checks package order by quantity, not list position', () => {
    const issues = issuesOf((c) => c.packages.reverse());
    expect(issues).toEqual([]);
  });

  it('warns on equal package discounts', () => {
    expect(find((c) => (c.packages[1]!.discountBp = 200), 'tierOrderEqual')[0]?.level).toBe('warning');
  });

  it('errors on duplicate or invalid tier quantities', () => {
    expect(find((c) => (c.packages[1]!.qty = 50), 'tierDuplicate')).toHaveLength(1);
    expect(find((c) => (c.packages[0]!.qty = 1), 'tierQtyInvalid')).toHaveLength(1);
    expect(find((c) => (c.packages[0]!.qty = 2.5), 'tierQtyInvalid')).toHaveLength(1);
  });

  it('errors on decreasing customer discounts, warns on equal', () => {
    expect(find((c) => (c.customers[2]!.discountBp = 100), 'customerOrderError')[0]).toMatchObject({
      path: 'customers.2.discountBp',
      params: { a: { text: { pl: 'hurt 1', en: 'wholesale 1' } } },
    });
    expect(find((c) => (c.customers[1]!.discountBp = 0), 'customerOrderEqual')).toHaveLength(1);
  });

  it('errors on missing, duplicate or unnamed customers', () => {
    expect(find((c) => (c.customers = []), 'customerNone')).toHaveLength(1);
    expect(find((c) => (c.customers[1]!.id = 'retail'), 'customerDuplicateId')).toHaveLength(1);
    expect(find((c) => (c.customers[1]!.label.en = ' '), 'customerLabelEmpty')).toHaveLength(1);
  });

  it('allows month types in any order and with equal discounts', () => {
    expect(issuesOf((c) => c.months.reverse())).toEqual([]);
    expect(issuesOf((c) => (c.months[1]!.discountBp = 0))).toEqual([]);
  });

  it('errors on missing, duplicate, reserved or unnamed month types', () => {
    expect(find((c) => (c.months = []), 'monthNone')).toHaveLength(1);
    expect(find((c) => (c.months[1]!.id = 'peak'), 'monthDuplicateId')[0]?.path).toBe('months.1.label');
    expect(find((c) => (c.months[0]!.id = 'sale'), 'monthDuplicateId')).toHaveLength(1);
    expect(find((c) => (c.months[2]!.label.pl = ''), 'monthLabelEmpty')).toHaveLength(1);
  });

  it('errors when the calendar refers to an unknown month type', () => {
    expect(find((c) => (c.calendar[4] = 'gone'), 'calendarUnknown')[0]?.path).toBe('calendar.4');
  });

  it('errors on discounts of 100 % or more and on negatives', () => {
    expect(find((c) => (c.customers[4]!.discountBp = 10000), 'discountTooHigh')).toHaveLength(1);
    expect(find((c) => (c.packages[0]!.discountBp = -1), 'discountNegative')).toHaveLength(1);
    expect(find((c) => (c.months[0]!.discountBp = 0.5), 'invalidNumber')).toHaveLength(1);
  });

  it('checks costs and profit ranges', () => {
    expect(find((c) => (c.handling.fixedGr = -1), 'negativeValue')).toHaveLength(1);
    expect(find((c) => (c.handling.percentBp = 100_001), 'valueTooHigh')).toHaveLength(1);
    expect(find((c) => (c.minProfit.fixedGr = 1.5), 'invalidNumber')).toHaveLength(1);
  });

  it('checks VAT', () => {
    expect(find((c) => (c.vatBp = 10001), 'vatRange')).toHaveLength(1);
    expect(find((c) => (c.vatBp = 700), 'vatUnusual')[0]?.level).toBe('warning');
    expect(find((c) => (c.vatBp = 800), 'vatUnusual')).toHaveLength(0);
  });

  it('checks sale factor', () => {
    expect(find((c) => (c.sale.factorBp = 0), 'saleFactorRange')).toHaveLength(1);
    expect(find((c) => (c.sale.factorBp = 100_001), 'saleFactorRange')).toHaveLength(1);
  });
});

describe('validateInput', () => {
  it('accepts positive values', () => {
    expect(validateInput(input(1, 1))).toEqual([]);
  });

  it('rejects zero, negative and huge values', () => {
    expect(validateInput(input(0, 1))[0]?.code).toBe('costNonPositive');
    expect(validateInput(input(1, 0))[0]?.code).toBe('qtyNonPositive');
    expect(validateInput(input(1_000_000_001, 1))[0]?.code).toBe('valueTooHigh');
    expect(validateInput(input(1, 10_000_001))[0]?.code).toBe('valueTooHigh');
  });

  it('hasErrors ignores warnings', () => {
    expect(hasErrors([{ level: 'warning', code: 'x' }])).toBe(false);
    expect(hasErrors([{ level: 'error', code: 'x' }])).toBe(true);
  });
});
