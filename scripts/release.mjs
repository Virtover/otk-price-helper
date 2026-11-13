/**
 * Publishes the GitHub release for the version in package.json:
 *   checks that the work is committed, on main and pushed, and that the installers of this version exist,
 *   creates and pushes the tag v<version> if it is missing, then creates the release with both installers.
 * Usage: npm run release   (needs git and the gh CLI, logged in; build first with `npm run tauri build`)
 * Commands run without a shell, so it behaves the same in PowerShell, cmd and Git Bash.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const assets = [
  `src-tauri/target/release/bundle/nsis/OTK Price Helper_${version}_x64-setup.exe`,
  `src-tauri/target/release/bundle/msi/OTK Price Helper_${version}_x64_en-US.msi`,
];

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
for (const file of assets) {
  if (!existsSync(file)) fail(`missing ${file} — run "npm run tauri build" first`);
}

const remoteTag = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}^{}`]);
if (remoteTag) {
  const tagged = remoteTag.split(/\s/)[0];
  if (tagged !== run('git', ['rev-parse', 'HEAD'])) fail(`${tag} already exists on another commit`);
  console.log(`✓ ${tag} already on GitHub`);
} else {
  if (!run('git', ['tag', '--list', tag])) run('git', ['tag', '-a', tag, '-m', `OTK Price Helper ${tag}`]);
  run('git', ['push', 'origin', tag], { stdio: 'inherit' });
  console.log(`✓ pushed ${tag}`);
}

execFileSync(
  'gh',
  ['release', 'create', tag, '--verify-tag', '--title', `OTK Price Helper ${tag}`, '--generate-notes', ...assets],
  { stdio: 'inherit' },
);
console.log(`✓ released ${tag}`);
