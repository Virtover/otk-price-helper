import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../src/config/defaults';
import { serializeConfig } from '../../src/config/io';
import { type AppState, type HistoryAction, type Tracked, groupOf, historyReducer, initialState, isDirty, reducer } from '../../src/ui/state';

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
  priceView: 'price',
  amounts: {},
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

describe('amount discounts', () => {
  it('set and clear manual amounts, dropping manual price edits like settings do', () => {
    const set = reducer(edited, { type: 'setAmount', key: '300|w4', value: 400n });
    expect(set.amounts).toEqual({ '300|w4': 400n });
    expect(set.overrides).toEqual({ rows: {} });
    expect(set.clearedOverrides).toBe(2);
    expect(reducer(set, { type: 'setAmount', key: '300|w4' }).amounts).toEqual({});
    expect(reducer(set, { type: 'resetAmounts' }).amounts).toEqual({});
  });

  it('keep manual amounts when the cost changes', () => {
    const set = reducer(base, { type: 'setAmount', key: '300|w4', value: 400n });
    expect(reducer(set, { type: 'setInput', field: 'cost', value: '12' }).amounts).toEqual({ '300|w4': 400n });
  });

  it('are remembered as strings and read back, skipping broken values', () => {
    const store: Record<string, string> = {
      'otk-price-helper.state.v1': JSON.stringify({ amounts: { '300|w4': '400', bad: 'x', neg: '-1' } }),
    };
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
    try {
      expect(initialState().amounts).toEqual({ '300|w4': 400n });
    } finally {
      vi.unstubAllGlobals();
    }
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
      expect(state.config.schemaVersion).toBe(4);
      expect(state.config.vatBp).toBe(800);
      expect(isDirty(state)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('undo / redo', () => {
  const start: Tracked = { app: base, past: [], future: [], at: 0 };
  const act = (action: Parameters<typeof reducer>[1], at: number, merge = false): HistoryAction => ({
    type: 'do',
    action,
    group: merge ? 'drag:1' : groupOf(action),
    at,
    merge,
  });
  const run = (h: Tracked, ...actions: HistoryAction[]) => actions.reduce(historyReducer, h);

  it('undoes and redoes price edits step by step', () => {
    const h = run(
      start,
      act({ type: 'setRowOverride', key: 'a', value: 5n }, 0),
      act({ type: 'setBaseOverride', value: 7n }, 5000),
    );
    expect(h.past).toHaveLength(2);
    const once = historyReducer(h, { type: 'undo' });
    expect(once.app.overrides).toEqual({ rows: { a: 5n } });
    const twice = historyReducer(once, { type: 'undo' });
    expect(twice.app.overrides).toEqual({ rows: {} });
    expect(historyReducer(twice, { type: 'undo' })).toBe(twice);
    const again = run(twice, { type: 'redo' }, { type: 'redo' });
    expect(again.app.overrides).toEqual({ rows: { a: 5n }, base: 7n });
  });

  it('a new change after an undo drops the redo steps', () => {
    const h = run(start, act({ type: 'setBaseOverride', value: 7n }, 0), { type: 'undo' });
    expect(h.future).toHaveLength(1);
    expect(run(h, act({ type: 'setBaseOverride', value: 9n }, 100)).future).toEqual([]);
  });

  it('merges quick changes of the same field and a whole drag into one step', () => {
    const typed = run(
      start,
      act({ type: 'setInput', field: 'cost', value: '1' }, 0),
      act({ type: 'setInput', field: 'cost', value: '12' }, 300),
      act({ type: 'setInput', field: 'cost', value: '12,5' }, 600),
    );
    expect(typed.past).toHaveLength(1);
    expect(historyReducer(typed, { type: 'undo' }).app.input.cost).toBe('10');
    const slow = run(start, act({ type: 'setInput', field: 'cost', value: '1' }, 0), act({ type: 'setInput', field: 'cost', value: '2' }, 5000));
    expect(slow.past).toHaveLength(2);
    const drag = run(
      start,
      act({ type: 'setBaseOverride', value: 2260n }, 0, true),
      act({ type: 'setBaseOverride', value: 2270n }, 9000, true),
    );
    expect(drag.past).toHaveLength(1);
  });

  it('a drag that ends where it started (Esc) leaves no step', () => {
    const h = run(
      start,
      act({ type: 'setBaseOverride', value: 2260n }, 0, true),
      act({ type: 'setOverrides', overrides: { rows: {} } }, 100, true),
    );
    expect(h.past).toEqual([]);
  });

  it('ignores view preferences and the language', () => {
    const h = run(start, act({ type: 'setLang', lang: 'en' }, 0), act({ type: 'setPriceView', value: 'percent' }, 10));
    expect(h.past).toEqual([]);
    expect(h.app.lang).toBe('en');
  });

  it('restores settings together with the manual edits they removed', () => {
    const edited = run(start, act({ type: 'setRowOverride', key: 'a', value: 5n }, 0));
    const changed = run(edited, act({ type: 'setConfig', config: { ...base.config, vatBp: 800 } }, 5000));
    expect(changed.app.overrides).toEqual({ rows: {} });
    const back = historyReducer(changed, { type: 'undo' });
    expect(back.app.config.vatBp).toBe(2300);
    expect(back.app.overrides).toEqual({ rows: { a: 5n } });
    expect(back.app.clearedOverrides).toBe(0);
  });
});
