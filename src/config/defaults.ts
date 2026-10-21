import type { Config } from '../core/types';

export const DEFAULT_CONFIG: Config = {
  schemaVersion: 3,
  handling: { percentBp: 1000, fixedGr: 50000 },
  minProfit: { percentBp: 1000, fixedGr: 0 },
  vatBp: 2300,
  fees: { percentBp: 0 },
  packages: [
    { qty: 50, discountBp: 200 },
    { qty: 100, discountBp: 400 },
    { qty: 200, discountBp: 600 },
    { qty: 300, discountBp: 800 },
  ],
  customers: [
    { id: 'retail', label: { pl: 'detaliczny', en: 'retail' }, discountBp: 0 },
    { id: 'w1', label: { pl: 'hurt 1', en: 'wholesale 1' }, discountBp: 500 },
    { id: 'w2', label: { pl: 'hurt 2', en: 'wholesale 2' }, discountBp: 800 },
    { id: 'w3', label: { pl: 'hurt 3', en: 'wholesale 3' }, discountBp: 1100 },
    { id: 'w4', label: { pl: 'hurt 4', en: 'wholesale 4' }, discountBp: 1400 },
  ],
  months: [
    { id: 'peak', label: { pl: 'Szczyt', en: 'Peak' }, discountBp: 0 },
    { id: 'pre1', label: { pl: 'Przedszczyt 1', en: 'Pre-peak 1' }, discountBp: 1000 },
    { id: 'pre2', label: { pl: 'Przedszczyt 2', en: 'Pre-peak 2' }, discountBp: 2000 },
    { id: 'pre3', label: { pl: 'Przedszczyt 3', en: 'Pre-peak 3' }, discountBp: 3000 },
  ],
  sale: { factorBp: 10000 },
  calendar: ['sale', 'sale', 'pre3', 'pre2', 'pre1', 'peak', 'sale', 'sale', 'pre3', 'pre2', 'pre1', 'peak'],
  ui: { discountInput: 'percent' },
};

export function cloneConfig(config: Config): Config {
  return structuredClone(config);
}
