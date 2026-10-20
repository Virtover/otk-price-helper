import type { Config } from '../core/types';
import { CURRENT_SCHEMA_VERSION, configSchema } from './schema';

export type LoadError = 'notJson' | 'noVersion' | 'newerVersion' | 'invalid';

export type LoadResult =
  | { ok: true; config: Config; migratedFrom?: number }
  | { ok: false; error: LoadError; details: string[] };

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** migrations[v] upgrades a v-file to v+1. Empty while only v1 exists. */
const migrations: Record<number, Migration> = {};

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

export function serializeConfig(config: Config): string {
  return JSON.stringify(config, null, 2) + '\n';
}
