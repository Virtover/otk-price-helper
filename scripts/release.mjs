/**
 * Publishes the GitHub release for the version in package.json:
 *   checks that the work is committed, on main and pushed, and that the signed installers of this version
 *   exist, creates and pushes the tag v<version> if it is missing, creates the release with both installers
 *   and finally uploads latest.json — the file installed apps read to find and verify the update.
 *   Running it again after a failure finishes the job (existing files are replaced).
 * Usage: npm run release   (needs git and the gh CLI, logged in; build first with `npm run build:app`)
 * Commands run without a shell, so it behaves the same in PowerShell, cmd and Git Bash.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const repo = 'Virtover/otk-price-helper';
const setup = `src-tauri/target/release/bundle/nsis/OTK Price Helper_${version}_x64-setup.exe`;
const msi = `src-tauri/target/release/bundle/msi/OTK Price Helper_${version}_x64_en-US.msi`;
// Published under names without spaces, so the download URL in latest.json is predictable.
const setupName = `OTK-Price-Helper_${version}_x64-setup.exe`;
const msiName = `OTK-Price-Helper_${version}_x64_en-US.msi`;

// The same version must be in every file that carries it.
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "(.+)"/m)?.[1];
if (tauri !== version || cargo !== version) {
  fail(`version mismatch: package.json ${version}, tauri.conf.json ${tauri}, Cargo.toml ${cargo}`);
}

if (run('git', ['status', '--porcelain'])) fail('uncommitted changes — commit them first');
if (run('git', ['branch', '--show-current']) !== 'main') fail('not on main — merge and switch to main first');
run('git', ['fetch', '--quiet', 'origin']);
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/main'])) {
  fail('main differs from origin/main — push (or pull) first');
}
for (const file of [setup, msi]) {
  if (!existsSync(file)) fail(`missing ${file} — run "npm run build:app" first`);
}
for (const file of [setup, msi]) {
  if (!existsSync(`${file}.sig`)) fail(`missing ${file}.sig — build with "npm run build:app" (it signs the update)`);
}

const remoteTag = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}^{}`]);
if (remoteTag) {
  const tagged = remoteTag.split(/\s/)[0];
  if (tagged !== run('git', ['rev-parse', 'HEAD'])) fail(`${tag} already exists on another commit`);
  console.log(`✓ ${tag} already on GitHub`);
} else {
  if (!run('git', ['tag', '--list', tag])) run('git', ['tag', '-a', tag, '-m', `OTK Price Helper ${tag}`]);
  execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });
  console.log(`✓ pushed ${tag}`);
}

const staging = mkdtempSync(join(tmpdir(), 'otk-release-'));
const staged = (from, name) => {
  copyFileSync(from, join(staging, name));
  return join(staging, name);
};
const assets = [staged(setup, setupName), staged(msi, msiName)];

let exists = true;
try {
  execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
} catch {
  exists = false;
}
if (exists) {
  execFileSync('gh', ['release', 'upload', tag, '--clobber', ...assets], { stdio: 'inherit' });
  console.log(`✓ ${tag} already released — installers uploaded again`);
} else {
  execFileSync(
    'gh',
    ['release', 'create', tag, '--verify-tag', '--title', `OTK Price Helper ${tag}`, '--generate-notes', ...assets],
    { stdio: 'inherit' },
  );
  console.log(`✓ released ${tag}`);
}

// Update manifest: installed apps read …/releases/latest/download/latest.json, compare the version,
// download their installer and check it against its signature (made with the private key at build time).
// Each installation updates with its own installer kind (the app knows how it was installed and looks up
// `windows-x86_64-msi` / `-nsis` first): an .msi installation fed the setup .exe would first have to be
// uninstalled, and Windows asks "Are you sure you want to uninstall this product?" in the middle of updating.
const entry = (file, name) => ({
  signature: readFileSync(`${file}.sig`, 'utf8').trim(),
  url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
});
const notes = run('gh', ['release', 'view', tag, '--json', 'body', '-q', '.body']);
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64-nsis': entry(setup, setupName),
    'windows-x86_64-msi': entry(msi, msiName),
    // Fallback for an app that does not know its installer kind.
    'windows-x86_64': entry(setup, setupName),
  },
};
const manifestPath = join(staging, 'latest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync('gh', ['release', 'upload', tag, '--clobber', manifestPath], { stdio: 'inherit' });
console.log('✓ uploaded latest.json — installed apps will offer this version');
