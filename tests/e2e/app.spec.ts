import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { type Page, expect, test } from '@playwright/test';

async function fill(page: Page, cost: string, qty: string) {
  await page.goto('/');
  await page.getByLabel('Koszt zakupu (netto, za sztukę)').fill(cost);
  await page.getByLabel('Liczba sztuk').fill(qty);
}

async function pickMonth(page: Page, label: string) {
  await page.getByTestId('month-selector').getByText(label, { exact: false }).first().click();
}

test('basic flow: three inputs give the anchored price list', async ({ page }) => {
  await fill(page, '10', '1000');
  await expect(page.getByTestId('stat-base')).toContainText('22,57');
  await expect(page.getByTestId('stat-base')).toContainText('27,76');
  await expect(page.getByTestId('stat-floor')).toContainText('12,50');
  await pickMonth(page, 'Przedszczyt 3');
  const anchor = page.getByTestId('cell-300|w4|pre3');
  await expect(anchor).toContainText('12,51');
  await expect(anchor).toHaveAttribute('data-status', 'anchor');
  await expect(page.getByTestId('issues-info')).toContainText('110,70');
});

test('input feedback: invalid numbers and tiers above quantity', async ({ page }) => {
  await fill(page, '10,555', '200');
  await expect(page.getByText('Za dużo miejsc po przecinku')).toBeVisible();
  await page.getByLabel('Koszt zakupu (netto, za sztukę)').fill('10');
  await expect(page.getByTestId('issues-warning')).toContainText('Pakiet 300 jest większy niż liczba kupionych sztuk (200)');
  await expect(page.getByTestId('cell-300|w4|peak')).toHaveCount(0);
});

test('breakdown explains a price', async ({ page }) => {
  await fill(page, '10', '1000');
  await pickMonth(page, 'Przedszczyt 3');
  await page.getByTestId('cell-300|w4|pre3').click();
  const panel = page.getByTestId('breakdown');
  await expect(panel).toContainText('= cena minimalna');
  await expect(panel).toContainText('×0,55384');
  await expect(panel).toContainText('12,51');
});

test('editing a price shifts all prices by default', async ({ page }) => {
  await fill(page, '10', '1000');
  await pickMonth(page, 'Szczyt');
  const cell = page.getByTestId('cell-50|retail|peak');
  await expect(cell).toContainText('22,12 / 1106,00');
  await expect(cell).toContainText('brutto 27,21 / 1360,38');

  await cell.click();
  await expect(page.getByTestId('price-editor-hint')).toContainText('przesunie wszystkie ceny');
  await page.getByTestId('price-editor-input').fill('25');
  await page.getByTestId('price-editor-apply').click();
  await expect(cell).toContainText('25,00 / 1250,00');
  await expect(cell).toHaveAttribute('data-status', 'ok');
  // ⌈B · 0,98⌉ = 25,00 → B = 25,51; the single-unit price follows.
  await expect(page.getByTestId('cell-1|retail|peak')).toContainText('25,51');
  await expect(page.getByTestId('stat-base')).toContainText('25,51');

  await page.getByTestId('price-editor-reset-shift').click();
  await expect(cell).toContainText('22,12 / 1106,00');
  await expect(page.getByTestId('cell-1|retail|peak')).toContainText('22,57');
});

test('"edit individually" changes only one combination', async ({ page }) => {
  await fill(page, '10', '1000');
  await pickMonth(page, 'Szczyt');
  const cell = page.getByTestId('cell-50|retail|peak');
  await cell.click();
  await page.getByTestId('price-editor-individually').check();
  await expect(page.getByTestId('price-editor-hint')).toContainText('tylko tę jedną kombinację');
  await page.getByTestId('price-editor-input').fill('25');
  await page.getByTestId('price-editor-apply').click();
  await expect(cell).toContainText('25,00 / 1250,00');
  await expect(cell).toHaveAttribute('data-status', 'override');
  await expect(page.getByTestId('cell-1|retail|peak')).toContainText('22,57');

  await page.getByTestId('price-editor-reset').click();
  await expect(cell).toContainText('22,12 / 1106,00');
  await expect(page.getByTestId('price-editor-reset')).toHaveCount(0);
});

test('maximum price highlights prices above it', async ({ page }) => {
  await fill(page, '10', '1000');
  await pickMonth(page, 'Szczyt');
  await expect(page.getByTestId('cell-1|retail|peak')).not.toHaveAttribute('data-above-max', 'true');
  await page.getByLabel('Cena maksymalna (netto, za sztukę)').fill('20');
  await expect(page.getByTestId('cell-1|retail|peak')).toHaveAttribute('data-above-max', 'true');
  await expect(page.getByTestId('cell-300|w4|peak')).not.toHaveAttribute('data-above-max', 'true');
  await expect(page.getByTestId('issues-warning')).toContainText('powyżej ceny maksymalnej 20,00');

  await page.getByLabel('Cena maksymalna (netto, za sztukę)').fill('abc');
  await expect(page.getByText('Niepoprawna liczba')).toBeVisible();
  await expect(page.getByTestId('cell-1|retail|peak')).not.toHaveAttribute('data-above-max', 'true');
});

test('manual edit with smart updates recalculates the row', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByText('Pokaż szczegóły').click();
  await page.getByLabel('Edytuj indywidualnie').check();
  await page.getByTestId('edit-1|retail|peak').click();
  await page.getByTestId('edit-1|retail|peak-input').fill('30');
  await page.getByTestId('edit-1|retail|peak-input').press('Enter');
  const row = page.getByTestId('price-table').locator('tr', { has: page.getByTestId('edit-1|retail|peak') });
  await expect(row).toContainText('36,90');
  await expect(row).toContainText('edytowana');

  // Below the floor → error status and a message.
  await page.getByTestId('edit-1|w1|peak').click();
  await page.getByTestId('edit-1|w1|peak-input').fill('5');
  await page.getByTestId('edit-1|w1|peak-input').press('Enter');
  await expect(page.getByTestId('issues-error')).toContainText('Ceny poniżej minimum: 1');

  // Changing the quantity drops edits with a notice.
  await page.getByLabel('Liczba sztuk').fill('999');
  await expect(page.getByText('Usunięto ręczne zmiany (2)')).toBeVisible();
});

test('language switch to English', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByTestId('lang-switch').getByText('EN').click();
  await expect(page.getByRole('tab', { name: 'Calculator' })).toBeVisible();
  await expect(page.getByTestId('stat-base')).toContainText('PLN 22.57');
});

test('settings validation links back to the field', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  const field = page.locator('#field-customers-4-discountBp');
  await field.fill('3');
  await expect(page.getByText('„hurt 4” ma mniejszy rabat niż „hurt 3”')).toBeVisible();
  await expect(page.getByTestId('unsaved-badge')).toBeVisible();

  await page.getByRole('tab', { name: 'Kalkulator' }).click();
  await expect(page.getByTestId('issues-error')).toContainText('Popraw ustawienia');
  await page.getByRole('button', { name: /Przejdź do pola/ }).first().click();
  await expect(page.locator('#field-customers-4-discountBp')).toBeFocused();
});

test('multiplier input mode converts discounts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  await page.getByTestId('discount-mode').getByText('× mnożnik').click();
  await expect(page.locator('#field-packages-0-discountBp')).toHaveValue('0,98');
  await page.locator('#field-packages-0-discountBp').fill('0,97');
  await page.getByTestId('discount-mode').getByText('% rabatu').click();
  await expect(page.locator('#field-packages-0-discountBp')).toHaveValue('3');
});

test('XLSX export requires a name and writes the workbook', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByTestId('export-xlsx').click();
  await expect(page.getByText('Nazwa produktu jest wymagana do eksportu')).toBeVisible();

  await page.getByLabel('Nazwa produktu').fill('Kubek: 330/ml');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-xlsx').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Kubek_330_ml_\d{4}-\d{2}-\d{2}\.xlsx$/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await file.path());
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    'Cennik',
    'Wszystkie kombinacje',
    'Rabaty',
    'Obliczenia',
    'Ustawienia',
    'Uwagi',
  ]);
  const all = wb.getWorksheet('Wszystkie kombinacje')!;
  expect(all.rowCount).toBe(126);
  const header = (all.getRow(1).values as unknown[]).slice(1);
  let anchor: unknown[] = [];
  all.eachRow((r) => {
    const v = (r.values as unknown[]).slice(1);
    if (v[header.indexOf('Klucz')] === '300|w4|pre3') anchor = v;
  });
  expect(anchor.slice(3, 7)).toEqual([12.51, 15.39, 3753, 4616.19]);
});

test('flexible price list fits prices under the maximum', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByLabel('Cena maksymalna (netto, za sztukę)').fill('20');
  await pickMonth(page, 'Szczyt');
  await expect(page.getByTestId('cell-1|retail|peak')).toHaveAttribute('data-above-max', 'true');

  await page.getByText('Elastyczny cennik').click();
  await expect(page.getByTestId('cell-1|retail|peak')).toContainText('20,00');
  await expect(page.getByTestId('cell-1|retail|peak')).not.toHaveAttribute('data-above-max', 'true');
  await expect(page.getByTestId('flex-badge')).toBeVisible();
  await expect(page.getByTestId('stat-base')).toContainText('20,00');
  await expect(page.getByTestId('issues-info')).toContainText('rozłożono między ceną minimalną a 20,00');
  await pickMonth(page, 'Wyprzedaż');
  await expect(page.getByTestId('cell-1|retail|sale')).toContainText('12,89');
  await pickMonth(page, 'Szczyt');

  // A shift edit in flexible mode lands exactly on the typed price; the others follow.
  await page.getByTestId('cell-50|retail|peak').click();
  await page.getByTestId('price-editor-input').fill('18');
  await page.getByTestId('price-editor-apply').click();
  await expect(page.getByTestId('cell-50|retail|peak')).toContainText('18,00');
  await expect(page.getByTestId('cell-1|retail|peak')).not.toContainText('20,00');

  // Sale prices are linked to the regular ones: they moved down with them.
  await page.keyboard.press('Escape');
  await pickMonth(page, 'Wyprzedaż');
  await expect(page.getByTestId('cell-1|retail|sale')).not.toContainText('14,54');
});

test('fees on the selling price raise the minimum price', async ({ page }) => {
  await fill(page, '10', '1000');
  await expect(page.getByTestId('stat-floor')).toContainText('12,50');
  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  await page.locator('#field-fees-percentBp').fill('10');
  await page.getByRole('tab', { name: 'Kalkulator' }).click();
  // 12,50 / (1 − 10 % × 1,23) = 14,25
  await expect(page.getByTestId('stat-floor')).toContainText('14,25');
});

test('config save and load round-trip', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  await page.locator('#field-vatBp').fill('8');
  await expect(page.getByTestId('unsaved-badge')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByTestId('config-save').click();
  const saved = readFileSync(await (await download).path(), 'utf8');
  expect(JSON.parse(saved).vatBp).toBe(800);
  await expect(page.getByTestId('unsaved-badge')).toHaveCount(0);

  await page.getByTestId('config-reset').click();
  await expect(page.locator('#field-vatBp')).toHaveValue('23');

  page.once('dialog', (d) => d.accept());
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('config-load').click();
  await (await chooser).setFiles(writeTemp(testInfo.outputPath('config.json'), saved));
  await expect(page.getByTestId('config-notice')).toContainText('Wczytano konfigurację');
  await expect(page.locator('#field-vatBp')).toHaveValue('8');

  // A broken file is rejected with details and changes nothing.
  page.once('dialog', (d) => d.accept());
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByTestId('config-load').click();
  await (await chooser2).setFiles(writeTemp(testInfo.outputPath('bad.json'), '{"schemaVersion": 9}'));
  await expect(page.getByTestId('config-notice')).toContainText('nowszej wersji');
  await expect(page.locator('#field-vatBp')).toHaveValue('8');
});

function writeTemp(path: string, content: string) {
  writeFileSync(path, content);
  return path;
}

test('light / dark theme toggle is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await page.getByRole('button', { name: 'Jasny motyw' }).click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
});

test('month types can be added, renamed and removed', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  const months = page.getByTestId('list-months');
  await months.getByRole('button', { name: /Dodaj rodzaj miesiąca/ }).click();
  await page.locator('#field-months-4-label').fill('Szczyt zimowy');
  await months.getByRole('textbox', { name: 'Nazwa (EN)' }).nth(4).fill('Winter peak');
  await page.locator('#field-months-4-discountBp').fill('5');

  await page.getByRole('tab', { name: 'Kalkulator' }).click();
  await pickMonth(page, 'Szczyt zimowy');
  // 5 % off the single-unit retail price 22,57 → ⌈21,4415⌉ = 21,45
  await expect(page.getByTestId('cell-1|retail|' + (await firstNewMonthId(page)))).toContainText('21,45');

  await page.getByRole('tab', { name: /Ustawienia/ }).click();
  await months.getByRole('button', { name: 'Usuń' }).nth(4).click();
  await page.getByRole('tab', { name: 'Kalkulator' }).click();
  await expect(page.getByTestId('month-selector')).not.toContainText('Szczyt zimowy');
});

/** Id of the month type added in the test (generated), read from a matrix cell. */
async function firstNewMonthId(page: Page) {
  const testId = await page.locator('[data-testid^="cell-1|retail|m"]').first().getAttribute('data-testid');
  return testId!.split('|')[2]!;
}
