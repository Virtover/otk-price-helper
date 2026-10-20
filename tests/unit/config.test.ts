import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { parseConfigFile, serializeConfig } from '../../src/config/io';

describe('config file', () => {
  it('round-trips the defaults', () => {
    expect(parseConfigFile(serializeConfig(DEFAULT_CONFIG))).toEqual({ ok: true, config: DEFAULT_CONFIG });
  });

  it('rejects non-JSON', () => {
    expect(parseConfigFile('{oops')).toMatchObject({ ok: false, error: 'notJson' });
  });

  it('rejects files without a version', () => {
    expect(parseConfigFile('{}')).toMatchObject({ ok: false, error: 'noVersion' });
    expect(parseConfigFile('[]')).toMatchObject({ ok: false, error: 'noVersion' });
    expect(parseConfigFile('null')).toMatchObject({ ok: false, error: 'noVersion' });
  });

  it('rejects newer versions', () => {
    const text = JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 2 });
    expect(parseConfigFile(text)).toMatchObject({ ok: false, error: 'newerVersion', details: ['2'] });
  });

  it('rejects older versions without a migration', () => {
    const text = JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 0 });
    expect(parseConfigFile(text)).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('lists offending keys of structurally invalid files', () => {
    const bad = { ...DEFAULT_CONFIG, vatBp: '23', calendar: ['peak'], extra: 1 };
    const r = parseConfigFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('invalid');
      expect(r.details.join('\n')).toMatch(/vatBp/);
      expect(r.details.join('\n')).toMatch(/calendar/);
    }
  });

  it('loads files that break business rules (shown as field errors instead)', () => {
    const text = JSON.stringify({ ...DEFAULT_CONFIG, months: { peakBp: 0, prePeakBp: [3000, 2000, 1000] } });
    expect(parseConfigFile(text).ok).toBe(true);
  });
});
