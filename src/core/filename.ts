const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Makes a product name safe as a Windows filename ("A/B: test" → "A_B_test"). */
export function sanitizeFileName(name: string, fallback: string): string {
  let s = name
    .replace(FORBIDDEN, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  if (s.length > 100) s = s.slice(0, 100);
  if (!s) s = fallback;
  if (RESERVED.test(s)) s = `_${s}`;
  return s;
}

/** "<product>_<YYYY-MM-DD>.<ext>" using the local date. */
export function exportFileName(name: string, date: Date, fallback: string, ext = 'xlsx'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${sanitizeFileName(name, fallback)}_${day}.${ext}`;
}
