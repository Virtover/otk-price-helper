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
| `npm run tauri build` | release build + `.msi` / setup `.exe` in `src-tauri/target/release/bundle/` (unsigned — fails without the signing key env) |
| `npm run build:app` | the same, signed for in-app updates (asks for the signing key password) — use this for releases |
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
   npm run build:app
   ```
   `build:app` asks for the update signing key password (see below) and also writes
   `…-setup.exe.sig`, the signature installed apps check before updating.
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
   `origin/main` and both signed installers of that version exist. Then it creates and pushes the tag
   `v<version>` (if missing), publishes the GitHub release with generated notes and both installers, and
   uploads `latest.json` — from that moment installed apps offer the update. If anything fails, run
   `npm run release` again: it finishes the job and replaces files already uploaded.

### In-app updates

On start (after 3 s) and when the version label in the header is clicked, the desktop app reads
`https://github.com/Virtover/otk-price-helper/releases/latest/download/latest.json`. A newer version is
offered in a banner ("Zaktualizuj teraz" / "Później"); the update downloads with progress, its signature
is checked against the public key in `tauri.conf.json`, the installer runs in passive mode and the app
restarts. Each installation updates with its own kind of installer — `.exe` installs get the setup, `.msi`
installs get the `.msi` (`latest.json` has an entry for each), so no uninstall prompt appears midway. Settings are kept. Offline, the automatic check stays silent. The latest **non-prerelease**
release counts, so mark a release as pre-release on GitHub to hold it back from users. 0.5.0 and older
have no updater — install 0.6.0 by hand once.

## Update signing key

App updates are signed; installed copies accept only updates signed with this key. It lives
outside the repository, in your user profile:

| File | What it is |
|---|---|
| `%USERPROFILE%\.tauri\otk-price-helper.key` | private key (password-protected) — **never commit or share** |
| `%USERPROFILE%\.tauri\otk-price-helper.key.pub` | public key — goes into `tauri.conf.json`, not secret |

```bash
npm run signing-key
```

Without a key it generates one (asks for a password twice); with a key it checks it and prints the
public key. It never overwrites an existing key. `*.key` is in `.gitignore` as a safety net.

**Back it up right after generating:** one password-manager entry with the password and the contents of
the `.key` file in its notes. If the key or its password is lost, no installed copy can be updated
again — users would have to reinstall by hand. If it leaks, someone could ship a fake update: generate a
new key and release a version with the new public key.

On a new computer: copy both files back into `%USERPROFILE%\.tauri\` and run `npm run signing-key`
to check.

## Layout

```
src/core/      pricing engine, exact rational math, validation, breakdown — no UI imports
src/export/    XLSX workbook export (ExcelJS)
src/config/    defaults, JSON schema, load/save with version migration
src/ui/        Calculator and Settings tabs, matrix, table, breakdown drawer
src/i18n/      pl.json, en.json
src/lib/       file dialogs (Tauri / browser fallback), storage
src-tauri/     desktop shell (window, dialog, fs, opener, updater and process plugins only)
scripts/       build.mjs (npm run build:app), release.mjs (npm run release), signing-key.mjs (npm run signing-key)
tests/unit/    Vitest; tests/e2e/ Playwright
```

All money is integer grosze and all intermediate values are exact fractions (BigInt) — there is no
floating point in the pricing core.
