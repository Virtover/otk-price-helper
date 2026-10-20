import { describe, expect, it } from 'vitest';
import {
  add,
  ceil,
  cmp,
  div,
  floor,
  fromBp,
  isInteger,
  max,
  mul,
  product,
  rat,
  roundHalf,
  sub,
} from '../../src/core/rational';

describe('rational', () => {
  it('normalizes sign and lowest terms', () => {
    expect(rat(2, 4)).toEqual({ n: 1n, d: 2n });
    expect(rat(1, -3)).toEqual({ n: -1n, d: 3n });
    expect(rat(0, 5)).toEqual({ n: 0n, d: 1n });
  });

  it('rejects zero denominators', () => {
    expect(() => rat(1, 0)).toThrow(RangeError);
    expect(() => div(rat(1), rat(0))).toThrow(RangeError);
  });

  it('does exact arithmetic', () => {
    expect(add(rat(1, 3), rat(1, 6))).toEqual(rat(1, 2));
    expect(sub(rat(1, 3), rat(1, 2))).toEqual(rat(-1, 6));
    expect(mul(rat(2, 3), rat(3, 4))).toEqual(rat(1, 2));
    expect(div(rat(1, 2), rat(1, 4))).toEqual(rat(2));
    expect(product([fromBp(9200), fromBp(8600), fromBp(7000)])).toEqual(rat(55384, 100000));
    expect(product([])).toEqual(rat(1));
  });

  it('compares', () => {
    expect(cmp(rat(1, 3), rat(1, 2))).toBe(-1);
    expect(cmp(rat(2, 4), rat(1, 2))).toBe(0);
    expect(max(rat(1, 3), rat(1, 2))).toEqual(rat(1, 2));
  });

  it('rounds floor / ceil for both signs', () => {
    expect(floor(rat(7, 2))).toBe(3n);
    expect(floor(rat(-7, 2))).toBe(-4n);
    expect(ceil(rat(7, 2))).toBe(4n);
    expect(ceil(rat(-7, 2))).toBe(-3n);
    expect(ceil(rat(4))).toBe(4n);
    expect(floor(rat(-4))).toBe(-4n);
  });

  it('rounds half away from zero', () => {
    expect(roundHalf(rat(5, 2))).toBe(3n);
    expect(roundHalf(rat(-5, 2))).toBe(-3n);
    expect(roundHalf(rat(249, 100))).toBe(2n);
    expect(roundHalf(rat(-249, 100))).toBe(-2n);
  });

  it('detects integers', () => {
    expect(isInteger(rat(4, 2))).toBe(true);
    expect(isInteger(rat(1, 2))).toBe(false);
  });
});
