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
    const text = JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 4 });
    expect(parseConfigFile(text)).toMatchObject({ ok: false, error: 'newerVersion', details: ['4'] });
  });

  it('migrates v1 files (fixed peak + 3 pre-peaks) to editable month types', () => {
    const v1 = { ...DEFAULT_CONFIG, schemaVersion: 1, months: { peakBp: 0, prePeakBp: [500, 1000, 1500] } };
    const r = parseConfigFile(JSON.stringify(v1));
    expect(r).toMatchObject({ ok: true, migratedFrom: 1 });
    if (r.ok) {
      expect(r.config.schemaVersion).toBe(3);
      expect(r.config.fees).toEqual({ percentBp: 0 });
      expect(r.config.months.map((m) => [m.id, m.label.pl, m.discountBp])).toEqual([
        ['peak', 'Szczyt', 0],
        ['pre1', 'Przedszczyt 1', 500],
        ['pre2', 'Przedszczyt 2', 1000],
        ['pre3', 'Przedszczyt 3', 1500],
      ]);
      expect(r.config.calendar).toEqual(DEFAULT_CONFIG.calendar);
    }
  });

  it('migrates v2 files by adding zero fees', () => {
    const { fees: _fees, ...rest } = DEFAULT_CONFIG;
    const r = parseConfigFile(JSON.stringify({ ...rest, schemaVersion: 2 }));
    expect(r).toMatchObject({ ok: true, migratedFrom: 2, config: { fees: { percentBp: 0 }, schemaVersion: 3 } });
  });

  it('rejects a broken v1 file instead of half-migrating it', () => {
    const v1 = { ...DEFAULT_CONFIG, schemaVersion: 1, months: { peakBp: 'x' } };
    expect(parseConfigFile(JSON.stringify(v1))).toMatchObject({ ok: false, error: 'invalid' });
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
    const months = DEFAULT_CONFIG.months.map((m) => ({ ...m, discountBp: 10000 }));
    const text = JSON.stringify({ ...DEFAULT_CONFIG, months });
    expect(parseConfigFile(text).ok).toBe(true);
  });
});
