import { useCallback, useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG } from '../config/defaults';
import { configKey, parseConfigFile, serializeConfig } from '../config/io';
import type { Locale } from '../core/money';
import type { Config, Overrides } from '../core/types';
import { readStored, writeStored } from '../lib/storage';
import { currentScrub } from './scrub';

export interface InputText {
  name: string;
  cost: string;
  qty: string;
  /** Optional maximum net unit price. */
  maxPrice: string;
}

export interface AppState {
  lang: Locale;
  config: Config;
  /** Serialized config as last saved to / loaded from a file (for the unsaved indicator). */
  savedSnapshot: string;
  input: InputText;
  overrides: Overrides;
  smartUpdates: boolean;
  showDetails: boolean;
  /** Price edits change only the edited combination instead of shifting all prices. */
  editIndividually: boolean;
  /** Spread prices between minimum and maximum price when discounts cannot fit under the maximum. */
  flexible: boolean;
  /** Number of manual edits dropped by the last input/config change (0 = no notice). */
  clearedOverrides: number;
  /** What the price matrix cells show: prices, or discounts from the month's retail price. */
  priceView: PriceView;
  /** Amount mode: amounts set by hand (grosze, key `qty|customerId`); other cells are generated. */
  amounts: Record<string, bigint>;
}

export type PriceView = 'price' | 'amount' | 'percent';
const PRICE_VIEWS: readonly PriceView[] = ['price', 'amount', 'percent'];

export type Action =
  | { type: 'setLang'; lang: Locale }
  | { type: 'setConfig'; config: Config }
  | { type: 'loadConfig'; config: Config }
  | { type: 'markSaved' }
  | { type: 'setInput'; field: keyof InputText; value: string }
  | { type: 'setRowOverride'; key: string; value?: bigint }
  | { type: 'setBaseOverride'; value?: bigint }
  | { type: 'setOverrides'; overrides: Overrides }
  | { type: 'setEditIndividually'; value: boolean }
  | { type: 'setFlexible'; value: boolean }
  | { type: 'resetOverrides' }
  | { type: 'setSmartUpdates'; value: boolean }
  | { type: 'setShowDetails'; value: boolean }
  | { type: 'setPriceView'; value: PriceView }
  | { type: 'setAmount'; key: string; value?: bigint }
  | { type: 'resetAmounts' }
  | { type: 'dismissCleared' };

const STORAGE_KEY = 'otk-price-helper.state.v1';

interface Stored {
  lang: Locale;
  config: string;
  savedSnapshot: string;
  input: InputText;
  smartUpdates: boolean;
  showDetails: boolean;
  editIndividually: boolean;
  flexible: boolean;
  priceView: PriceView;
  /** Grosze as strings (JSON has no BigInt). */
  amounts: Record<string, string>;
}

const countOverrides = (o: Overrides) =>
  Object.keys(o.rows).length +
  [o.base, o.saleBase, o.flexLow, o.flexSaleLow].filter((v) => v !== undefined).length;
const NO_OVERRIDES: Overrides = { rows: {} };

/** Manual edits refer to concrete prices; once the inputs change they would be misleading. */
function dropOverrides(state: AppState): Partial<Pick<AppState, 'overrides' | 'clearedOverrides'>> {
  const count = countOverrides(state.overrides);
  return count > 0 ? { overrides: NO_OVERRIDES, clearedOverrides: count } : {};
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setLang':
      return { ...state, lang: action.lang };
    case 'setConfig':
      return { ...state, config: action.config, ...dropOverrides(state) };
    case 'loadConfig':
      return { ...state, config: action.config, savedSnapshot: serializeConfig(action.config), ...dropOverrides(state) };
    case 'markSaved':
      return { ...state, savedSnapshot: serializeConfig(state.config) };
    case 'setInput': {
      const next = { ...state, input: { ...state.input, [action.field]: action.value } };
      // Name and the optional price limit do not change any calculated price.
      return action.field === 'name' || action.field === 'maxPrice' ? next : { ...next, ...dropOverrides(state) };
    }
    case 'setRowOverride': {
      const rows = { ...state.overrides.rows };
      if (action.value === undefined) delete rows[action.key];
      else rows[action.key] = action.value;
      return { ...state, overrides: { ...state.overrides, rows } };
    }
    case 'setBaseOverride': {
      const { base: _drop, ...rest } = state.overrides;
      return { ...state, overrides: action.value === undefined ? rest : { ...rest, base: action.value } };
    }
    case 'setOverrides':
      return { ...state, overrides: action.overrides };
    case 'setEditIndividually':
      return { ...state, editIndividually: action.value };
    case 'setFlexible':
      return { ...state, flexible: action.value };
    case 'resetOverrides':
      return { ...state, overrides: NO_OVERRIDES };
    case 'setSmartUpdates':
      return { ...state, smartUpdates: action.value };
    case 'setShowDetails':
      return { ...state, showDetails: action.value };
    case 'setPriceView':
      return { ...state, priceView: action.value };
    // Amounts change prices like settings do, so manual price edits are dropped. They are kept when the
    // cost or quantity change: they are the shop's own decision, and the base keeps them above the minimum.
    case 'setAmount': {
      const amounts = { ...state.amounts };
      if (action.value === undefined) delete amounts[action.key];
      else amounts[action.key] = action.value;
      return { ...state, amounts, ...dropOverrides(state) };
    }
    case 'resetAmounts':
      return { ...state, amounts: {}, ...dropOverrides(state) };
    case 'dismissCleared':
      return { ...state, clearedOverrides: 0 };
  }
}

function readAmounts(stored: unknown): Record<string, bigint> {
  if (typeof stored !== 'object' || stored === null) return {};
  const out: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(stored)) {
    if (typeof v === 'string' && /^\d{1,12}$/.test(v)) out[k] = BigInt(v);
  }
  return out;
}

export function initialState(): AppState {
  const stored = readStored<Partial<Stored>>(STORAGE_KEY) ?? {};
  const loaded = stored.config ? parseConfigFile(stored.config) : undefined;
  const config = loaded?.ok ? loaded.config : structuredClone(DEFAULT_CONFIG);
  const lang: Locale = stored.lang === 'en' ? 'en' : 'pl';
  // The snapshot may come from an older app version: migrate it like the config itself.
  const snapshot = stored.savedSnapshot ? parseConfigFile(stored.savedSnapshot) : undefined;
  return {
    lang,
    config,
    savedSnapshot: serializeConfig(snapshot?.ok ? snapshot.config : config),
    input: { name: '', cost: '', qty: '', maxPrice: '', ...stored.input },
    overrides: NO_OVERRIDES,
    smartUpdates: stored.smartUpdates ?? true,
    showDetails: stored.showDetails ?? false,
    editIndividually: stored.editIndividually ?? false,
    flexible: stored.flexible ?? false,
    clearedOverrides: 0,
    priceView: PRICE_VIEWS.includes(stored.priceView as PriceView) ? stored.priceView! : 'price',
    amounts: readAmounts(stored.amounts),
  };
}

/** What undo / redo restore: everything that decides the prices (not view preferences or the language). */
type Snapshot = Pick<AppState, 'config' | 'input' | 'overrides' | 'amounts' | 'flexible'>;
const snapshotOf = (s: AppState): Snapshot => ({
  config: s.config,
  input: s.input,
  overrides: s.overrides,
  amounts: s.amounts,
  flexible: s.flexible,
});
const snapshotKey = (s: Snapshot) => JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));

export interface Tracked {
  app: AppState;
  /** States to go back to (oldest first) and forward to after an undo (most recent undo last). */
  past: Snapshot[];
  future: Snapshot[];
  /** Group and time of the last recorded change: quick changes of the same thing are one step. */
  group?: string;
  at: number;
}

export type HistoryAction =
  | { type: 'undo' }
  | { type: 'redo' }
  /** `merge`: always join the previous step of the same group (one drag), regardless of time. */
  | { type: 'do'; action: Action; group: string; at: number; merge?: boolean };

const HISTORY_LIMIT = 100;
/** Changes of one group closer together than this (typing a number) are one undo step. */
const MERGE_MS = 1000;

/** Group of an action for merging: the same field or cell. */
export const groupOf = (a: Action): string =>
  a.type + ('field' in a ? `:${a.field}` : '') + ('key' in a ? `:${a.key}` : '');

export function historyReducer(h: Tracked, a: HistoryAction): Tracked {
  if (a.type === 'undo' || a.type === 'redo') {
    const from = a.type === 'undo' ? h.past : h.future;
    if (from.length === 0) return h;
    const to = [...(a.type === 'undo' ? h.future : h.past), snapshotOf(h.app)];
    const rest = from.slice(0, -1);
    const app = { ...h.app, ...from[from.length - 1]!, clearedOverrides: 0 };
    return a.type === 'undo' ? { app, past: rest, future: to, at: 0 } : { app, past: to, future: rest, at: 0 };
  }
  const app = reducer(h.app, a.action);
  const before = snapshotKey(snapshotOf(h.app));
  const after = snapshotKey(snapshotOf(app));
  if (before === after) return { ...h, app };
  const merge = h.past.length > 0 && h.group === a.group && (a.merge || a.at - h.at < MERGE_MS);
  if (!merge) {
    return { app, past: [...h.past, snapshotOf(h.app)].slice(-HISTORY_LIMIT), future: [], group: a.group, at: a.at };
  }
  // A merged step that ends where it started (a drag cancelled with Esc) is no step at all.
  const past = snapshotKey(h.past[h.past.length - 1]!) === after ? h.past.slice(0, -1) : h.past;
  return { app, past, future: [], group: a.group, at: a.at };
}

export function useAppState() {
  const [tracked, send] = useReducer(historyReducer, undefined, () => ({
    app: initialState(),
    past: [],
    future: [],
    at: 0,
  }));
  const state = tracked.app;
  const dispatch = useCallback((action: Action) => {
    const drag = currentScrub();
    send({
      type: 'do',
      action,
      group: drag === undefined ? groupOf(action) : `drag:${drag}`,
      merge: drag !== undefined,
      at: Date.now(),
    });
  }, []);
  const history = {
    canUndo: tracked.past.length > 0,
    canRedo: tracked.future.length > 0,
    undo: useCallback(() => send({ type: 'undo' }), []),
    redo: useCallback(() => send({ type: 'redo' }), []),
  };
  useEffect(() => {
    const stored: Stored = {
      lang: state.lang,
      config: serializeConfig(state.config),
      savedSnapshot: state.savedSnapshot,
      input: state.input,
      smartUpdates: state.smartUpdates,
      showDetails: state.showDetails,
      editIndividually: state.editIndividually,
      flexible: state.flexible,
      priceView: state.priceView,
      amounts: Object.fromEntries(Object.entries(state.amounts).map(([k, v]) => [k, v.toString()])),
    };
    writeStored(STORAGE_KEY, stored);
  }, [state]);
  return [state, dispatch, history] as const;
}

const DEFAULT_KEY = configKey(DEFAULT_CONFIG);

/**
 * Settings differ from the last saved / loaded file. The defaults never count as
 * unsaved — they can always be restored with one click, so nothing would be lost.
 */
export function isDirty(state: AppState): boolean {
  const key = configKey(state.config);
  return key !== DEFAULT_KEY && key !== configKey(JSON.parse(state.savedSnapshot));
}
export { countOverrides };
