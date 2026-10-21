import type { Config } from '../core/types';
import { CURRENT_SCHEMA_VERSION, configSchema } from './schema';

export type LoadError = 'notJson' | 'noVersion' | 'newerVersion' | 'invalid';

export type LoadResult =
  | { ok: true; config: Config; migratedFrom?: number }
  | { ok: false; error: LoadError; details: string[] };

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

const V1_MONTH_LABELS: [string, string, string][] = [
  ['peak', 'Szczyt', 'Peak'],
  ['pre1', 'Przedszczyt 1', 'Pre-peak 1'],
  ['pre2', 'Przedszczyt 2', 'Pre-peak 2'],
  ['pre3', 'Przedszczyt 3', 'Pre-peak 3'],
];

/** migrations[v] upgrades a v-file to v+1. */
const migrations: Record<number, Migration> = {
  // v1 → v2: fixed peak + 3 pre-peak discounts become an editable list of month types (same ids).
  1: (old) => {
    const months = old.months as { peakBp?: unknown; prePeakBp?: unknown[] } | undefined;
    const discounts = [months?.peakBp, ...(months?.prePeakBp ?? [])];
    return {
      ...old,
      months: V1_MONTH_LABELS.map(([id, pl, en], i) => ({ id, label: { pl, en }, discountBp: discounts[i] })),
    };
  },
  // v2 → v3: price-proportional fees, none by default.
  2: (old) => ({ ...old, fees: { percentBp: 0 } }),
};

/** Parses a config file. Never returns a partially applied config. */
export function parseConfigFile(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson', details: [] };
  }
  if (typeof raw !== 'object' || raw === null || typeof (raw as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    return { ok: false, error: 'noVersion', details: [] };
  }
  let data = raw as Record<string, unknown>;
  const version = data.schemaVersion as number;
  if (version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: 'newerVersion', details: [String(version)] };
  }
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) return { ok: false, error: 'invalid', details: [`schemaVersion ${version}`] };
    data = { ...migrate(data), schemaVersion: v + 1 };
  }
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid',
      details: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return {
    ok: true,
    config: parsed.data as Config,
    ...(version < CURRENT_SCHEMA_VERSION ? { migratedFrom: version } : {}),
  };
}

/** Canonical form for comparing configs: key order (e.g. from a hand-edited file) does not matter. */
export function configKey(config: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(canonical(config));
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config, null, 2) + '\n';
}
