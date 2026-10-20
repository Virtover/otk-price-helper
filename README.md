# OTK Price Helper

Desktop app (Windows, Tauri 2 + React + TypeScript) that calculates an online-shop price list for one
product: every package size × customer type × month type, net and gross, per unit and per package.
The deepest regular discount combination is priced exactly at the minimum profit, so no combination
falls below it. Full rules: [SPEC.md](SPEC.md).

## Requirements

- Node.js 20+
- For the desktop build: Rust (stable, MSVC toolchain), Visual Studio Build Tools with
  **"Desktop development with C++"** including a **Windows 10/11 SDK**, and WebView2 (built into Windows 11).

## Commands

| Command | What it does |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | UI in the browser at http://localhost:1420 (file dialogs fall back to download/upload) |
| `npm run tauri dev` | desktop app with hot reload |
| `npm run tauri build` | release build + `.msi` / setup `.exe` in `src-tauri/target/release/bundle/` |
| `npm test` | unit + property tests (Vitest, fast-check) |
| `npm run coverage` | tests with coverage (core must stay ≥ 95 % lines) |
| `npm run e2e` | end-to-end tests (Playwright, Chromium; first run: `npx playwright install chromium`) |
| `npm run typecheck` | TypeScript check |

## Layout

```
src/core/      pricing engine, exact rational math, validation, breakdown, CSV — no UI imports
src/config/    defaults, JSON schema, load/save with version migration
src/ui/        Calculator and Settings tabs, matrix, table, breakdown drawer
src/i18n/      pl.json, en.json
src/lib/       file dialogs (Tauri / browser fallback), storage
src-tauri/     desktop shell (window, dialog + fs plugins only)
tests/unit/    Vitest; tests/e2e/ Playwright
```

All money is integer grosze and all intermediate values are exact fractions (BigInt) — there is no
floating point in the pricing core.
