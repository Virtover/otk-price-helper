/**
 * Exact rational numbers on BigInt. The pricing core never uses floating point:
 * every intermediate value is a Rat, and only final prices are rounded to grosze.
 */
export interface Rat {
  readonly n: bigint;
  /** Always > 0; fraction is always in lowest terms. */
  readonly d: bigint;
}

function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new RangeError('Division by zero');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}

export const ZERO = rat(0);
export const ONE = rat(1);

/** Basis points (1 bp = 0.01 %) as a fraction: 250 bp → 1/40. */
export function fromBp(bp: number | bigint): Rat {
  return rat(bp, 10000n);
}

export function add(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rat, b: Rat): Rat {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new RangeError('Division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

export function cmp(a: Rat, b: Rat): -1 | 0 | 1 {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export const eq = (a: Rat, b: Rat) => cmp(a, b) === 0;
export const lt = (a: Rat, b: Rat) => cmp(a, b) < 0;
export const le = (a: Rat, b: Rat) => cmp(a, b) <= 0;
export const gt = (a: Rat, b: Rat) => cmp(a, b) > 0;
export const ge = (a: Rat, b: Rat) => cmp(a, b) >= 0;

export function max(a: Rat, b: Rat): Rat {
  return ge(a, b) ? a : b;
}

export function floor(a: Rat): bigint {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}

export function ceil(a: Rat): bigint {
  const q = a.n / a.d;
  return a.n > 0n && q * a.d !== a.n ? q + 1n : q;
}

/** Commercial rounding: half away from zero (0.005 → 0.01, −0.005 → −0.01). */
export function roundHalf(a: Rat): bigint {
  const r = floor(add(rat(abs(a.n), a.d), rat(1, 2)));
  return a.n < 0n ? -r : r;
}

export function isInteger(a: Rat): boolean {
  return a.d === 1n;
}

/** Product of a list of fractions (1 for an empty list). */
export function product(values: readonly Rat[]): Rat {
  return values.reduce(mul, ONE);
}
