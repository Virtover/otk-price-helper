<p align="center">
  <img src="app-icon.svg" alt="OTK Price Helper icon" width="128" height="128" />
</p>

<h1 align="center">OTK Price Helper</h1>

<p align="center"><em>Set your prices in seconds</em></p>

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

## Releasing

Every command is a single line, so it works the same in PowerShell, cmd and Git Bash.

1. **Bump the version** in all five places (keep them equal):
   `package.json`, `package-lock.json` (two entries at the top), `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` and the `otk-price-helper` entry in `src-tauri/Cargo.lock`.
   New features or a new config `schemaVersion` → minor (`0.3.1` → `0.4.0`); fixes only → patch.
   Commit the bump.
2. **Check and build** — everything must pass, then build the installers from the committed state:
   ```bash
   npm run typecheck
   npm test
   npm run e2e
   npm run tauri build
   ```
3. **Merge to `main`** and push (the feature branch must contain everything on `main`):
   ```bash
   git checkout main
   git merge --ff-only <branch>
   git push origin main
   ```
4. **Publish** (needs the `gh` CLI, logged in):
   ```bash
   npm run release
   ```
   [`scripts/release.mjs`](scripts/release.mjs) takes the version from `package.json` and stops with a
   message unless the version is the same in all files, everything is committed, `main` matches
   `origin/main` and both installers of that version exist. Then it creates and pushes the tag
   `v<version>` (if missing) and publishes the GitHub release with generated notes and both installers.
   If an upload fails, `gh` removes the release but the tag stays — just run `npm run release` again.

## Layout

```
src/core/      pricing engine, exact rational math, validation, breakdown — no UI imports
src/export/    XLSX workbook export (ExcelJS)
src/config/    defaults, JSON schema, load/save with version migration
src/ui/        Calculator and Settings tabs, matrix, table, breakdown drawer
src/i18n/      pl.json, en.json
src/lib/       file dialogs (Tauri / browser fallback), storage
src-tauri/     desktop shell (window, dialog, fs and opener plugins only)
scripts/       release.mjs (npm run release)
tests/unit/    Vitest; tests/e2e/ Playwright
```

All money is integer grosze and all intermediate values are exact fractions (BigInt) — there is no
floating point in the pricing core.
