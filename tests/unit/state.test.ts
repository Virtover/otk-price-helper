import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../src/config/defaults';
import { serializeConfig } from '../../src/config/io';
import { type AppState, initialState, isDirty, reducer } from '../../src/ui/state';

const base: AppState = {
  lang: 'pl',
  config: cloneConfig(DEFAULT_CONFIG),
  savedSnapshot: serializeConfig(DEFAULT_CONFIG),
  input: { name: '', cost: '10', qty: '1000', maxPrice: '' },
  overrides: { rows: {} },
  smartUpdates: true,
  showDetails: false,
  editIndividually: false,
  flexible: false,
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

  it('replaces all overrides at once and counts the sale base', () => {
    const s = reducer(base, { type: 'setOverrides', overrides: { rows: { a: 1n }, base: 2n, saleBase: 3n } });
    expect(s.overrides.saleBase).toBe(3n);
    expect(reducer(s, { type: 'setInput', field: 'cost', value: '12' }).clearedOverrides).toBe(3);
  });

  it('keeps overrides when only the price limit changes', () => {
    const s = reducer(edited, { type: 'setInput', field: 'maxPrice', value: '20' });
    expect(s.overrides.base).toBe(7n);
    expect(s.input.maxPrice).toBe('20');
  });

  it('switches simple flags', () => {
    expect(reducer(base, { type: 'setEditIndividually', value: true }).editIndividually).toBe(true);
    expect(reducer(base, { type: 'setLang', lang: 'en' }).lang).toBe('en');
    expect(reducer(base, { type: 'setSmartUpdates', value: false }).smartUpdates).toBe(false);
    expect(reducer(base, { type: 'setShowDetails', value: true }).showDetails).toBe(true);
    expect(reducer(edited, { type: 'resetOverrides' }).overrides).toEqual({ rows: {} });
  });
});

describe('unsaved indicator', () => {
  const custom = cloneConfig(DEFAULT_CONFIG);
  custom.vatBp = 800;
  const savedCustom = reducer(base, { type: 'loadConfig', config: custom });

  it('never counts the defaults as unsaved', () => {
    const reset = reducer(savedCustom, { type: 'setConfig', config: cloneConfig(DEFAULT_CONFIG) });
    expect(isDirty(reset)).toBe(false);
  });

  it('ignores key order of a hand-edited file', () => {
    const reordered = { ...custom, vatBp: 800 };
    const snapshot = JSON.stringify(Object.fromEntries(Object.entries(reordered).reverse()));
    expect(isDirty({ ...savedCustom, savedSnapshot: snapshot })).toBe(false);
  });

  it('still reports real changes against the saved file', () => {
    const changed = cloneConfig(custom);
    changed.vatBp = 500;
    expect(isDirty(reducer(savedCustom, { type: 'setConfig', config: changed }))).toBe(true);
  });
});

describe('state remembered by an older app version', () => {
  it('migrates a v1 snapshot so unchanged settings are not shown as unsaved', () => {
    const v1 = JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 1, vatBp: 800, months: { peakBp: 0, prePeakBp: [1000, 2000, 3000] } });
    const store: Record<string, string> = {
      'otk-price-helper.state.v1': JSON.stringify({ config: v1, savedSnapshot: v1 }),
    };
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
    try {
      const state = initialState();
      expect(state.config.schemaVersion).toBe(3);
      expect(state.config.vatBp).toBe(800);
      expect(isDirty(state)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
