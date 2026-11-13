/**
 * Release build with signed update files: npm run build:app
 * Reads the update signing key from the user profile (see `npm run signing-key`), asks for its password
 * without echoing it (or takes TAURI_SIGNING_PRIVATE_KEY_PASSWORD), then runs `tauri build`.
 * Output: both installers plus `…-setup.exe.sig`, the signature the in-app updater checks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEY_PATH = join(homedir(), '.tauri', 'otk-price-helper.key');
const tauriCli = join('node_modules', '@tauri-apps', 'cli', 'tauri.js');

if (!existsSync(KEY_PATH)) {
  console.error(`✗ no update signing key at ${KEY_PATH} — run "npm run signing-key" (or restore it from your backup)`);
  process.exit(1);
}

/** Reads a line from the terminal without showing what is typed. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('no terminal to ask for the password — set TAURI_SIGNING_PRIVATE_KEY_PASSWORD'));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let text = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(text);
          return;
        }
        if (ch === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u0008' || ch === '\u007f') text = text.slice(0, -1);
        else text += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const password =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? (await askHidden('Update signing key password: '));

try {
  execFileSync(process.execPath, [tauriCli, 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY_PATH, 'utf8').trim(),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
    },
  });
} catch {
  console.error('✗ build failed (a wrong key password fails at the signing step at the end)');
  process.exit(1);
}
