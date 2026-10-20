import { readFileSync, writeFileSync } from 'node:fs';
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

test('edit a single price from the matrix', async ({ page }) => {
  await fill(page, '10', '1000');
  await pickMonth(page, 'Szczyt');
  const cell = page.getByTestId('cell-50|retail|peak');
  await expect(cell).toContainText('22,12 / 1106,00');
  await expect(cell).toContainText('brutto 27,21 / 1360,38');

  await cell.click();
  await page.getByTestId('price-editor-input').fill('25');
  await page.getByTestId('price-editor-apply').click();
  await expect(cell).toContainText('25,00 / 1250,00');
  await expect(cell).toHaveAttribute('data-status', 'override');

  await page.getByTestId('price-editor-reset').click();
  await expect(cell).toContainText('22,12 / 1106,00');
  await expect(page.getByTestId('price-editor-reset')).toHaveCount(0);
});

test('manual edit with smart updates recalculates the row', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByText('Pokaż szczegóły').click();
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

test('CSV export requires a name and writes Polish Excel format', async ({ page }) => {
  await fill(page, '10', '1000');
  await page.getByTestId('export-csv').click();
  await expect(page.getByText('Nazwa produktu jest wymagana do eksportu')).toBeVisible();

  await page.getByLabel('Nazwa produktu').fill('Kubek: 330/ml');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-csv').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Kubek_330_ml_\d{4}-\d{2}-\d{2}\.csv$/);
  const content = readFileSync(await file.path(), 'utf8');
  expect(content.charCodeAt(0)).toBe(0xfeff);
  const lines = content.trim().split('\r\n');
  expect(lines).toHaveLength(126);
  expect(lines[0]).toContain('Pakiet;Klient;Miesiąc;Szt. netto');
  expect(lines.find((l) => l.startsWith('300;hurt 4;Przedszczyt 3;'))).toContain('12,51;15,39;3753,00;4616,19');
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
