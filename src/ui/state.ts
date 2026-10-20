import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG } from '../config/defaults';
import { configKey, parseConfigFile, serializeConfig } from '../config/io';
import type { Locale } from '../core/money';
import type { Config, Overrides } from '../core/types';
import { readStored, writeStored } from '../lib/storage';

export interface InputText {
  name: string;
  cost: string;
  qty: string;
  /** Optional maximum net unit price. */
  maxPrice: string;
}

export type Dialect = 'pl' | 'intl';

export interface AppState {
  lang: Locale;
  config: Config;
  /** Serialized config as last saved to / loaded from a file (for the unsaved indicator). */
  savedSnapshot: string;
  input: InputText;
  overrides: Overrides;
  smartUpdates: boolean;
  showDetails: boolean;
  dialect: Dialect;
  /** Price edits change only the edited combination instead of shifting all prices. */
  editIndividually: boolean;
  /** Number of manual edits dropped by the last input/config change (0 = no notice). */
  clearedOverrides: number;
}

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
  | { type: 'resetOverrides' }
  | { type: 'setSmartUpdates'; value: boolean }
  | { type: 'setShowDetails'; value: boolean }
  | { type: 'setDialect'; value: Dialect }
  | { type: 'dismissCleared' };

const STORAGE_KEY = 'otk-price-helper.state.v1';

interface Stored {
  lang: Locale;
  config: string;
  savedSnapshot: string;
  input: InputText;
  smartUpdates: boolean;
  showDetails: boolean;
  dialect: Dialect;
  editIndividually: boolean;
}

const countOverrides = (o: Overrides) =>
  Object.keys(o.rows).length + (o.base !== undefined ? 1 : 0) + (o.saleBase !== undefined ? 1 : 0);
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
    case 'resetOverrides':
      return { ...state, overrides: NO_OVERRIDES };
    case 'setSmartUpdates':
      return { ...state, smartUpdates: action.value };
    case 'setShowDetails':
      return { ...state, showDetails: action.value };
    case 'setDialect':
      return { ...state, dialect: action.value };
    case 'dismissCleared':
      return { ...state, clearedOverrides: 0 };
  }
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
    dialect: stored.dialect === 'intl' ? 'intl' : 'pl',
    editIndividually: stored.editIndividually ?? false,
    clearedOverrides: 0,
  };
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  useEffect(() => {
    const stored: Stored = {
      lang: state.lang,
      config: serializeConfig(state.config),
      savedSnapshot: state.savedSnapshot,
      input: state.input,
      smartUpdates: state.smartUpdates,
      showDetails: state.showDetails,
      dialect: state.dialect,
      editIndividually: state.editIndividually,
    };
    writeStored(STORAGE_KEY, stored);
  }, [state]);
  return [state, dispatch] as const;
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
