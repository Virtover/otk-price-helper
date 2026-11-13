/**
 * The private key that signs app updates lives outside the repository, in the user profile:
 *   %USERPROFILE%\.tauri\otk-price-helper.key      (private — never commit or share)
 *   %USERPROFILE%\.tauri\otk-price-helper.key.pub  (public — goes into tauri.conf.json)
 * Usage: npm run signing-key
 *   no key yet → generates it (asks for a password twice), then shows how to back it up;
 *   key present → checks it and prints the public key. Never overwrites an existing key.
 * Commands run without a shell, so it behaves the same in PowerShell, cmd and Git Bash.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const KEY_DIR = join(homedir(), '.tauri');
export const KEY_PATH = join(KEY_DIR, 'otk-price-helper.key');
const PUB_PATH = `${KEY_PATH}.pub`;
const tauriCli = join('node_modules', '@tauri-apps', 'cli', 'tauri.js');

function showPublicKey() {
  if (!existsSync(PUB_PATH)) {
    console.error(`✗ missing ${PUB_PATH} — the private key is there, but its public half is not.`);
    console.error('  Restore it from your backup (it is not secret).');
    process.exit(1);
  }
  console.log(`\nPublic key (${PUB_PATH}):\n${readFileSync(PUB_PATH, 'utf8').trim()}\n`);
}

if (existsSync(KEY_PATH)) {
  console.log(`✓ signing key found: ${KEY_PATH}`);
  showPublicKey();
  process.exit(0);
}

console.log(`No signing key yet — generating ${KEY_PATH}`);
console.log('Choose a strong password; you will need it for every release build.\n');
mkdirSync(KEY_DIR, { recursive: true });
execFileSync(process.execPath, [tauriCli, 'signer', 'generate', '--write-keys', KEY_PATH], { stdio: 'inherit' });
if (!existsSync(KEY_PATH)) {
  console.error('✗ the key was not written');
  process.exit(1);
}
console.log(`\n✓ signing key written: ${KEY_PATH}`);
showPublicKey();
console.log(`Back it up NOW — without this key no installed copy can ever be updated again:
  1. In your password manager, create an entry "OTK Price Helper — update signing key".
  2. Put the password in it.
  3. Paste the contents of ${KEY_PATH} into its notes (or attach the file).
  4. Do not keep copies in the repository, e-mail or chat.`);
