# OTK Price Helper — Specification

Status: **draft v0.4** · Date: 2026-10-20
Items marked **[ASSUMPTION]** are decisions taken by default and still open for confirmation (see §15).

---

## 1. Purpose

A small Windows desktop app that calculates the sales price list for one product in an online shop:
every combination of package size × customer type × month type, with net and gross prices per unit
and per package, guaranteeing that **no combination (outside of sale) ever falls below the minimum profit**.

UX principle **"flow-grow"**: a beginner gets a correct price list from 3 inputs; advanced users
progressively unlock configuration, manual overrides and per-row explanations.

Languages: **Polish (default) / English**, switchable at runtime.

---

## 2. Glossary

| PL | EN | Symbol | Meaning |
|---|---|---|---|
| koszt zakupu | purchase cost | `c` | net purchase price **per unit** |
| liczba | quantity | `N` | number of units in the shop's purchase order |
| koszty obsługi % | handling cost % | `h` | % of `c`, per unit |
| koszty obsługi liczba | handling cost fixed | `H` | PLN for the **whole volume of `N` units bought by the shop** — never per unit; spread over units only as `⌈H/N⌉` |
| koszt jednostkowy | unit cost | `K` | `c·(1+h) + ⌈H/N⌉` |
| minimalny zysk | minimum profit | `p%`, `P` | per unit, relative to `c` |
| próg | floor | `F` | `K + c·p% + P` — lowest allowed net unit price |
| cena maksymalna (UI; spec: cena bazowa) | maximum price (UI; spec: base price) | `B` | net price: 1 unit, retail customer, peak month — the undiscounted list price |
| mnożnik | multiplier | `m` | `1 − discount%` |
| pakiet | package tier | — | quantity threshold with a discount |
| rodzaj klienta | customer type | — | retail / wholesale 1–4 |
| typ miesiąca | month type | — | user-defined list (default: peak, pre-peak 1–3) + built-in sale |
| WYPRZEDAŻ | sale | `s` | sale price factor, applied to `K` |

---

## 3. Inputs (main tab)

| Field | Type | Validation |
|---|---|---|
| Product name | text | required; used in export filename (forbidden filename chars stripped) |
| Purchase cost `c` | PLN, 2 decimals | `> 0`; accepts `12,50` and `12.50` |
| Quantity `N` | integer | `≥ 1` |
| Maximum price (optional) | PLN, net per unit | `> 0`; empty = no limit. Rows whose net unit price exceeds it are highlighted (orange frame, ▲) and counted in a warning; a limit below the minimum price `F` gets its own warning. It never changes any price. |

Results recalculate live on every valid change (debounced).

---

## 4. Configuration (settings tab)

All values editable in the app, savable to / loadable from a JSON file (§11).

### 4.1 Costs, profit, VAT

| Key | Default | Validation |
|---|---|---|
| Handling % `h` | 10 % | `0 ≤ h < 1000 %` |
| Handling fixed `H` (per whole order) | 500.00 PLN | `≥ 0` |
| Min profit % `p%` (of `c`) | 10 % | `≥ 0` |
| Min profit fixed `P` (per unit) | 0.00 PLN | `≥ 0` |
| VAT | 23 % | `0 ≤ VAT ≤ 100 %`; warning if not one of 0/5/8/23 |

Min profit components are **added**: `c·p% + P`.

### 4.2 Discounts (stack multiplicatively)

Each discount can be entered as **% discount** or as **price multiplier** (one toggle for all discounts and the sale factor;
`5 %` ⇔ `×0.95`). Precision: 0.01 % (multiplier: 4 decimals) — more precision is rejected.

**Package tiers** (quantity ≥ threshold → tier discount). An implicit tier "1 unit, 0 %" always exists.

| Threshold | Default discount |
|---|---|
| 50 | 2 % |
| 100 | 4 % |
| 200 | 6 % |
| 300 | 8 % |

**Customer types** (ordered smallest → largest discount; user can rename/add/remove)

| Type | Default discount |
|---|---|
| detaliczny (retail) | 0 % |
| hurt 1 | 5 % |
| hurt 2 | 8 % |
| hurt 3 | 11 % |
| hurt 4 | 14 % |

**Month types** (editable list like customer types: add / remove / rename in PL and EN / reorder;
free order, several types may share a discount, e.g. summer and winter peak)

| Type (default) | Default discount |
|---|---|
| Szczyt / Peak | 0 % |
| Przedszczyt 1 / Pre-peak 1 | 10 % |
| Przedszczyt 2 / Pre-peak 2 | 20 % |
| Przedszczyt 3 / Pre-peak 3 | 30 % |
| WYPRZEDAŻ (sale) | built in, not removable — see 4.3 |

The **first** month type is the reference for the maximum price card and the retail profit
(1 unit · first customer type · first month type). Removing a month type moves calendar months
that used it to the first remaining type.

Optional (advanced): 12-month calendar mapping each calendar month → month type, used only to
highlight the "current" column. Peak months: **June, December**. Proposed default for the rest
[ASSUMPTION A9]: pre-peak N = N months before a peak, months after a peak = sale.

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sale | sale | pre 3 | pre 2 | pre 1 | **peak** | sale | sale | pre 3 | pre 2 | pre 1 | **peak** |

### 4.3 Sale (WYPRZEDAŻ)

| Key | Default | Entered as |
|---|---|---|
| Sale factor `s` | 100 % (×1.00) | % of unit cost **or** multiplier |

Deepest sale combination (largest package × largest customer discount) is priced at `s · K`,
i.e. `s · (purchase cost + handling)`. Other sale combinations are scaled from it
by their package and customer multipliers. Month discounts do not apply in sale.

`s·K` is a **net** amount (costs are net). VAT is added on top exactly as for every other row, so at
`s = 100 %` the shop recovers its full cost and passes the VAT on to the tax office — zero profit, zero loss.

> UI note: sale `%` means "% **of cost**" (100 % = sell at cost), while discount `%` means
> "% **off**". Labels must say this explicitly.

### 4.4 Configuration validation

| Rule | Level |
|---|---|
| Larger package tier has **smaller** discount than a smaller tier | error |
| Two tiers with **equal** discount | warning |
| Duplicate tier thresholds | error |
| Customer types not non-decreasing in discount | error (decreasing) / warning (equal) |
| No month type / duplicate or reserved (`sale`) id / empty name | error |
| Calendar month refers to a non-existent month type (only possible in a hand-edited file) | error |
| Any discount `≥ 100 %` (multiplier `≤ 0`) | error |
| Negative discount (surcharge) | error |
| Sale factor `< 100 %` | warning: "sale below cost — loss per unit X PLN" |
| Sale factor so high that a sale price exceeds the same non-sale combination | warning |
| VAT not 0/5/8/23 | warning |

---

## 5. Calculation

### 5.1 Arithmetic rules

- All money in **integer grosze**; percentages in **integer basis points** (1 bp = 0.01 %).
- Intermediate values are **exact rationals** (BigInt numerator/denominator). No floating point anywhere in the core.
- Rounding to grosz is **always up (ceil)** for prices the shop receives, unless stated otherwise,
  so rounding never causes a loss. VAT conversion of a non-basis column uses **half-up**.

### 5.2 Steps

1. **Unit cost**
   `K = c·(1+h) + ⌈H / N⌉` — fixed handling per unit is ceiled to the grosz (shop never under-recovers `H`).
2. **Floor**
   `F = K + c·p% + P`
3. **Eligible package tiers** — tiers with threshold `> N` are **excluded** from anchor and output,
   with a warning [ASSUMPTION A7].
4. **Deepest non-sale multiplier**
   `M_deep = m(largest eligible tier) · m(largest customer discount) · m(deepest month type)`
5. **Base price (net)**
   `B = ⌈F / M_deep⌉` (grosze). `B` is rounded once and displayed; every combination is computed
   from the **displayed** `B`, so the user can reproduce any number.
6. **Combination multiplier** `m = m_package · m_customer · m_month`
7. **Unit price per combination** — **net is the price basis for all customer types**:
   `net_u = ⌈B · m⌉`; `gross_u = round_half_up(net_u · (1+VAT))` (informative)
8. **Package totals** (quantity `q` = tier threshold, or 1 for the implicit tier)
   - `net_total = net_u · q` → **divisible by `q` by construction**
   - `gross_total = round_half_up(net_total · (1+VAT))` — matches how an invoice computes VAT.
     It may differ from `gross_u · q` by a few grosze and is then not divisible by `q`;
     the breakdown panel shows an info note in that case.
9. **Sale combinations**
   `B_sale = ⌈s·K / (m(largest tier) · m(largest customer))⌉`, then steps 6–8 with `m_month = 1`
   and `B_sale` instead of `B`.
10. **Profit** (exact, using exact net): `profit_u = net_u − K`, `profit_% = profit_u / c`,
    `profit_total = profit_u · q`.
11. **Effective discount** vs `B` (or `B_sale`): `1 − net_u / B` — differs from nominal by rounding.

### 5.3 Invariants (must hold, enforced by tests)

- I1. For every non-sale combination: exact `net_u ≥ F`.
- I2. The anchor combination's `net_u − F < 2 gr` (anchor is tight: ≤ 1 gr from ceiling `B`, ≤ 1 gr from ceiling `net_u`).
- I3. `net_total == net_u · q` exactly; all values in grosze are integers.
- I4. Monotonic: more discount in any dimension ⇒ unit price not higher.
- I5. Sale deepest combination: exact `net_u ≥ s·K`.
- I6. Results are independent of order of discount application.

---

## 6. Output

### 6.1 Combinations

Defaults: 5 package tiers (1, 50, 100, 200, 300) × 5 customer types × 5 month types (peak,
pre-peak 1–3, sale) = **125 rows**.

### 6.2 Columns

| Column | Notes |
|---|---|
| package (q) | |
| customer type | |
| month type | |
| unit net, unit gross | net is the divisible basis |
| package total net, package total gross | |
| profit per unit, profit total | |
| profit % (of `c`) | |
| nominal discount, effective discount | |
| status | OK · anchor · sale · override · error |

### 6.3 Views

- **Matrix** (default): rows = package tiers, columns = customer types, selector = month type;
  each cell shows unit price (basis) and package total; colour = status.
- **Flat table**: all rows, sortable/filterable — identical to CSV export.
- **Summary header**: `K`, `F`, `B` net/gross, retail profit as % of `c`.
- **Breakdown panel** ("why this price?"): click a row → waterfall
  `c → +handling % → +fixed handling → K → +min profit → F → ÷M_deep → B → ×discounts → rounding → VAT → result`.

---

## 7. Editing and smart updates

- Cells editable: unit price (basis column) of any row; base price `B` in the summary header.
- **Edit mode** (checkbox **"Edytuj indywidualnie"**, default off, remembered):
  - off (default) — the edit **shifts** the base so the edited row lands exactly on the entered price
    (`B = ⌊(target − 1) / m⌋ + 1`, the smallest base with `⌈B · m⌉ = target`); every row sharing that
    base follows its discounts. Regular rows shift `B`, sale rows shift only the sale base. Individually
    edited rows keep their value. "Reset to calculated prices" removes the shift.
  - on — only the edited combination changes (override).
- Unit **net** price is the editable one; gross is always derived.
- Manual edits are cleared (with a notice) when purchase cost, quantity or settings change —
  they refer to concrete prices that would otherwise silently become wrong.
- Edited cell = **override**: highlighted, lockable, revertible ("reset to calculated").
- Checkbox **"smart updates"** (default on):
  - editing a unit price → recompute that row's totals, profit, effective discount, status;
  - editing `B` → recompute all non-overridden rows from the new `B`.
  - off: only the edited cell changes; derived cells marked **stale**.
- A row whose net unit price `< F` (non-sale) or `< s·K` (sale) → **error** status, shown red with the
  shortfall in PLN. Export of rows with errors requires confirmation.
- Non-integer grosze entered (e.g. `12.345`) → rejected with message.

---

## 8. Feedback and edge cases

| Situation | Level | Message (EN; PL in i18n) |
|---|---|---|
| `c ≤ 0`, `N < 1`, non-numeric input | error | field-level, inline |
| Tier threshold `> N` | warning | "Package 300 exceeds quantity 200 — excluded" |
| No eligible tier besides 1 unit | info | "No package discounts apply for N = …" |
| `⌈H/N⌉ > c` (fixed handling dominates, small N) | warning | "Fixed handling is X % of unit cost" |
| Rounding of `H/N` added > 0 | info (breakdown only) | "Rounded up by 0.00X PLN to avoid loss" |
| Retail profit (1 unit, first customer, peak) > 100 % of `c` | info | "Retail profit is X % of purchase cost because the deepest discounts must still reach the minimum profit" |
| Very large values (unit price > 10 000 000 PLN) | error | "Value out of supported range" |
| Config file invalid / newer version | error | lists offending keys; current config unchanged |
| Config file older version | info | migrated automatically |
| Unsaved config changes on exit/load | confirm dialog | |
| Export with error rows | confirm dialog | |

Every error/warning must point to **what** to change (field link/focus), not just state the problem.

---

## 9. UX structure

- **Tab 1 — Calculator** (default): 3 inputs → summary header → matrix. Button "Export CSV".
  Toggle "Show details" reveals flat table, overrides, smart-updates checkbox, breakdown panel.
- **Tab 2 — Settings**: sections 4.1–4.3, %/multiplier toggles, calendar (collapsed "advanced"),
  Save / Load / Reset to defaults, unsaved-changes indicator.
- Language switch in the header. Last-used config and language remembered between sessions.

---

## 10. CSV export

- Encoding **UTF-8 with BOM**, separator `;`, decimal comma (`12,50`), CRLF — opens correctly in Polish Excel.
- Header row localized to the current UI language.
- Option (advanced): `,` separator + decimal point for non-Polish tools.
- Default filename: `<product-name>_<YYYY-MM-DD>.csv`.

---

## 11. Config file

JSON, with schema version for migration:

```json
{
  "schemaVersion": 2,
  "handling": { "percentBp": 1000, "fixedGr": 50000 },
  "minProfit": { "percentBp": 1000, "fixedGr": 0 },
  "vatBp": 2300,
  "packages": [
    { "qty": 50, "discountBp": 200 },
    { "qty": 100, "discountBp": 400 },
    { "qty": 200, "discountBp": 600 },
    { "qty": 300, "discountBp": 800 }
  ],
  "customers": [
    { "id": "retail", "label": { "pl": "detaliczny", "en": "retail" }, "discountBp": 0 },
    { "id": "w1", "label": { "pl": "hurt 1", "en": "wholesale 1" }, "discountBp": 500 },
    { "id": "w2", "label": { "pl": "hurt 2", "en": "wholesale 2" }, "discountBp": 800 },
    { "id": "w3", "label": { "pl": "hurt 3", "en": "wholesale 3" }, "discountBp": 1100 },
    { "id": "w4", "label": { "pl": "hurt 4", "en": "wholesale 4" }, "discountBp": 1400 }
  ],
  "months": [
    { "id": "peak", "label": { "pl": "Szczyt", "en": "Peak" }, "discountBp": 0 },
    { "id": "pre1", "label": { "pl": "Przedszczyt 1", "en": "Pre-peak 1" }, "discountBp": 1000 },
    { "id": "pre2", "label": { "pl": "Przedszczyt 2", "en": "Pre-peak 2" }, "discountBp": 2000 },
    { "id": "pre3", "label": { "pl": "Przedszczyt 3", "en": "Pre-peak 3" }, "discountBp": 3000 }
  ],
  "sale": { "factorBp": 10000 },
  "calendar": ["sale","sale","pre3","pre2","pre1","peak","sale","sale","pre3","pre2","pre1","peak"],
  "ui": { "discountInput": "percent" }
}
```

Validated with a schema on load; invalid files never partially apply. Version 1 files (fixed
`{ peakBp, prePeakBp[3] }`) are migrated automatically to the month-type list with the same ids.

---

## 12. Internationalization

- `pl.json`, `en.json`; all user-visible strings (incl. errors and CSV headers) go through i18n.
- Number formatting via `Intl.NumberFormat` (`pl-PL`: `1 234,50 zł`; `en`: `PLN 1,234.50`).
- Input parsing accepts both decimal separators regardless of language.

---

## 13. Tech stack and architecture

**Tauri 2 + React + TypeScript + Vite**

| Concern | Choice |
|---|---|
| Pricing core | pure TS module, no UI deps; BigInt rationals (`core/rational.ts`) |
| Table / matrix | Mantine `Table` (filter + sort hand-rolled; 125 rows need no grid library) |
| UI kit | Mantine |
| Validation | Zod (inputs, config file) |
| i18n | i18next |
| File dialogs | Tauri `dialog` + `fs` plugins |
| Unit / property tests | Vitest + fast-check |
| E2E | Playwright (a few smoke flows) |
| Packaging | Tauri bundler → Windows `.msi` / `.exe` |

```
src/core/       rational, money, pricing engine, validation, csv   (no UI imports)
src/config/     schema, defaults, migration, load/save
src/ui/         calculator tab, settings tab, matrix, table, breakdown
src/i18n/       pl.json, en.json
tests/          unit, property, e2e
```

---

## 14. Testing

- **Unit**: each calculation step; rounding helpers; parsing `12,50`/`12.50`; CSV formatting; config migration.
- **Property-based** (fast-check, random valid configs & inputs): invariants I1–I6; CSV round-trip;
  "%" ⇔ multiplier round-trip.
- **Golden test**: worked example §16 must reproduce exactly.
- **Validation**: one test per rule in §4.4 and §8.
- **E2E**: enter 3 inputs → matrix shows anchor at floor; edit cell with smart updates; save/load config; switch language; export CSV.
- Coverage target: `src/core` ≥ 95 % lines.

---

## 15. Open questions / assumptions

Confirmed: A1 purchase cost per unit · A2 min profit `%` + PLN added · A3 multiplicative stacking ·
A4 net price is the divisible basis for all customers · A5 sale = `s·K` ·
A6 package & customer discounts apply in sale · A7 tiers with threshold `> N` excluded (warning) ·
A8 Tauri + TypeScript · peak months = June, December.

| ID | Open assumption | Alternative |
|---|---|---|
| A9 | Non-peak calendar as in §4.2 (cosmetic only — highlights current column) | user-provided mapping |

---

## 16. Worked example (defaults)

Input: `c = 10.00 PLN`, `N = 1000`.

| Step | Value |
|---|---|
| handling % | 10.00 · 10 % = 1.00 |
| fixed handling / unit | ⌈500.00 / 1000⌉ = 0.50 |
| `K` | 11.50 |
| min profit | 10.00 · 10 % + 0 = 1.00 |
| `F` | 12.50 |
| `M_deep` | 0.92 · 0.86 · 0.70 = 0.55384 |
| `B` | ⌈12.50 / 0.55384⌉ = ⌈22.5697…⌉ = **22.57 net** (retail profit 110.7 % of `c`) |

Selected rows:

| package | customer | month | unit net | unit gross | total net | total gross | profit/unit |
|---|---|---|---|---|---|---|---|
| 1 | retail | peak | 22.57 | 27.76 | 22.57 | 27.76 | 11.07 |
| 50 | retail | peak | 22.12 | 27.21 | 1 106.00 | 1 360.38 | 10.62 |
| 100 | hurt 2 | pre-peak 1 | 17.95 | 22.08 | 1 795.00 | 2 207.85 | 6.45 |
| 300 | hurt 4 | pre-peak 3 | **12.51** (anchor) | 15.39 | 3 753.00 | 4 616.19 | 1.01 |
| 300 | hurt 4 | sale | 11.51 | 14.16 | 3 453.00 | 4 247.19 | 0.01 |
| 1 | retail | sale | 14.54 | 17.88 | 14.54 | 17.88 | 3.04 |

Sale base: `B_sale = ⌈11.50 / (0.92·0.86)⌉ = 14.54`. Gross totals are VAT on the net total
(e.g. `1 106.00 · 1.23 = 1 360.38`, while `27.21 · 50 = 1 360.50`).
Note the anchor lands at 12.51, not 12.50 — the 1 gr is the cost of guaranteed round-up.

---

## 17. Out of scope (v1)

Multiple products / batch import, marketplace & payment fees, psychological rounding (x.99),
demand-based optimisation, cloud sync, auto-update.
