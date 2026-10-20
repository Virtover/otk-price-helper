/**
 * File and dialog access. Inside Tauri this uses the native dialogs and the fs
 * plugin; in a plain browser (dev server, e2e tests) it falls back to
 * downloads, <input type=file> and window.confirm.
 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Returns the saved path / filename, or null when the user cancelled. */
export async function saveTextFile(defaultName: string, content: string, filter: FileFilter): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: defaultName, filters: [filter] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

export async function openTextFile(filter: FileFilter): Promise<{ name: string; content: string } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, directory: false, filters: [filter] });
    if (typeof path !== 'string') return null;
    return { name: path, content: await readTextFile(path) };
  }
  return new Promise((resolve) => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = filter.extensions.map((e) => `.${e}`).join(',');
    el.addEventListener('change', async () => {
      const file = el.files?.[0];
      resolve(file ? { name: file.name, content: await file.text() } : null);
    });
    el.addEventListener('cancel', () => resolve(null));
    el.click();
  });
}

export async function confirmDialog(message: string, title: string): Promise<boolean> {
  if (isTauri()) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, { title, kind: 'warning' });
  }
  return window.confirm(message);
}
