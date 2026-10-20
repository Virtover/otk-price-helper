import { DEFAULT_CONFIG, cloneConfig } from '../../src/config/defaults';
import { calculate } from '../../src/core/pricing';
import type { Config, Overrides, PriceList, ProductInput } from '../../src/core/types';

export const input = (costGr: number, qty: number, name = 'Test'): ProductInput => ({
  name,
  costGr: BigInt(costGr),
  qty: BigInt(qty),
});

export function config(patch: (c: Config) => void = () => {}): Config {
  const c = cloneConfig(DEFAULT_CONFIG);
  patch(c);
  return c;
}

/** Calculates and asserts success. */
export function list(
  inp: ProductInput,
  cfg: Config = config(),
  overrides?: Overrides,
  smartUpdates = true,
): PriceList {
  const r = calculate(inp, cfg, overrides, { smartUpdates });
  if (!r.ok) throw new Error(`calculation failed: ${JSON.stringify(r.issues)}`);
  return r.list;
}

export function row(l: PriceList, key: string) {
  const r = l.rows.find((x) => x.key === key);
  if (!r) throw new Error(`no row ${key}`);
  return r;
}

export const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
