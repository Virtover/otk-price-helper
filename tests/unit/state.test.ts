import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../src/config/defaults';
import { serializeConfig } from '../../src/config/io';
import { type AppState, isDirty, reducer } from '../../src/ui/state';

const base: AppState = {
  lang: 'pl',
  config: cloneConfig(DEFAULT_CONFIG),
  savedSnapshot: serializeConfig(DEFAULT_CONFIG),
  input: { name: '', cost: '10', qty: '1000' },
  overrides: { rows: {} },
  smartUpdates: true,
  showDetails: false,
  dialect: 'pl',
  clearedOverrides: 0,
};

const edited = reducer(reducer(base, { type: 'setRowOverride', key: 'k', value: 5n }), {
  type: 'setBaseOverride',
  value: 7n,
});

describe('app state', () => {
  it('stores and removes overrides', () => {
    expect(edited.overrides).toEqual({ rows: { k: 5n }, base: 7n });
    const cleared = reducer(reducer(edited, { type: 'setRowOverride', key: 'k' }), { type: 'setBaseOverride' });
    expect(cleared.overrides).toEqual({ rows: {} });
  });

  it('drops overrides with a notice when cost, quantity or config change', () => {
    const s = reducer(edited, { type: 'setInput', field: 'cost', value: '11' });
    expect(s.overrides).toEqual({ rows: {} });
    expect(s.clearedOverrides).toBe(2);
    const c = reducer(edited, { type: 'setConfig', config: cloneConfig(DEFAULT_CONFIG) });
    expect(c.clearedOverrides).toBe(2);
    expect(reducer(c, { type: 'dismissCleared' }).clearedOverrides).toBe(0);
  });

  it('keeps overrides when only the product name changes', () => {
    const s = reducer(edited, { type: 'setInput', field: 'name', value: 'Kubek' });
    expect(s.overrides.base).toBe(7n);
    expect(s.clearedOverrides).toBe(0);
  });

  it('does not show a notice when there was nothing to clear', () => {
    expect(reducer(base, { type: 'setInput', field: 'qty', value: '5' }).clearedOverrides).toBe(0);
  });

  it('tracks unsaved config changes', () => {
    expect(isDirty(base)).toBe(false);
    const changed = cloneConfig(DEFAULT_CONFIG);
    changed.vatBp = 800;
    const s = reducer(base, { type: 'setConfig', config: changed });
    expect(isDirty(s)).toBe(true);
    expect(isDirty(reducer(s, { type: 'markSaved' }))).toBe(false);
    expect(isDirty(reducer(s, { type: 'loadConfig', config: changed }))).toBe(false);
  });

  it('switches simple flags', () => {
    expect(reducer(base, { type: 'setLang', lang: 'en' }).lang).toBe('en');
    expect(reducer(base, { type: 'setSmartUpdates', value: false }).smartUpdates).toBe(false);
    expect(reducer(base, { type: 'setShowDetails', value: true }).showDetails).toBe(true);
    expect(reducer(base, { type: 'setDialect', value: 'intl' }).dialect).toBe('intl');
    expect(reducer(edited, { type: 'resetOverrides' }).overrides).toEqual({ rows: {} });
  });
});
