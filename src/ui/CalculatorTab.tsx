import { Alert, Button, Checkbox, Group, Paper, Stack, Switch, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { type Dispatch, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportFileName } from '../core/filename';
import { parseInteger, parseMoney } from '../core/money';
import { calculate, clampToFlex, monthIds, shiftOverrides } from '../core/pricing';
import { ceil } from '../core/rational';
import type { MonthType, PriceRow, ProductInput } from '../core/types';
import { confirmDialog, saveBinaryFile } from '../lib/fileio';
import { Breakdown } from './components/Breakdown';
import { IssueList } from './components/IssueList';
import { PriceMatrix } from './components/PriceMatrix';
import { PriceTable } from './components/PriceTable';
import { StepHeader } from './components/StepHeader';
import { Summary } from './components/Summary';
import { fieldId, issueMessage, money } from './format';
import { type Action, type AppState, countOverrides } from './state';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onGoTo: (path: string) => void;
}

export function CalculatorTab({ state, dispatch, onGoTo }: Props) {
  const { t } = useTranslation();
  const { lang, config, input } = state;
  const ids = monthIds(config);
  const calendarMonth = config.calendar[new Date().getMonth()];
  const currentMonth = calendarMonth && ids.includes(calendarMonth) ? calendarMonth : ids[0]!;
  const [chosenMonth, setMonth] = useState<MonthType>(currentMonth);
  // A month type removed in settings falls back to the current one.
  const month = ids.includes(chosenMonth) ? chosenMonth : currentMonth;
  const [selectedKey, setSelectedKey] = useState<string>();
  const [nameError, setNameError] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string }>();

  const cost = parseMoney(input.cost);
  const qty = parseInteger(input.qty);
  const maxPrice = parseMoney(input.maxPrice);
  // The limit is optional: empty or invalid text simply means "no limit" (invalid text gets a field error).
  const maxPriceGr = maxPrice.ok && maxPrice.value > 0n ? maxPrice.value : undefined;
  const product: ProductInput | undefined =
    cost.ok && qty.ok ? { name: input.name, costGr: cost.value, qty: qty.value, maxPriceGr } : undefined;

  // product is a fresh object each render; recalculate only when its source strings change.
  const result = useMemo(
    () => (product ? calculate(product, config, state.overrides, {
            smartUpdates: state.smartUpdates,
            flexible: state.flexible,
          }) : undefined),
    [input.cost, input.qty, maxPriceGr, config, state.overrides, state.smartUpdates, state.flexible],
  );
  const allIssues = result ? (result.ok ? result.list.issues : result.issues) : [];
  const fieldError = (path: string, parsed: ReturnType<typeof parseMoney>, raw: string) => {
    if (raw.trim() === '') return undefined;
    if (!parsed.ok) return t(`parse.${parsed.error}`);
    const issue = allIssues.find((i) => i.path === path && i.level === 'error');
    return issue ? issueMessage(issue, lang, t) : undefined;
  };
  const list = result?.ok ? result.list : undefined;
  const selected = list?.rows.find((r) => r.key === selectedKey);
  const overrideCount = countOverrides(state.overrides);

  const setInput = (field: keyof AppState['input']) => (e: React.ChangeEvent<HTMLInputElement>) =>
    dispatch({ type: 'setInput', field, value: e.currentTarget.value });

  /** Flexible mode keeps every price between its minimum and what the price limit allows. */
  const constrainRow = (row: PriceRow, value: bigint) => {
    if (!list) return { value };
    const c = clampToFlex(list, row, value);
    if (!c.reason) return { value: c.value };
    const params = { value: money(c.value, lang), min: money(c.range!.min, lang) };
    if (c.reason === 'max') {
      const key = row.month === 'sale' ? 'edit.clampedMaxSale' : 'edit.clampedMax';
      return { value: c.value, note: t(key, { ...params, max: money(list.input.maxPriceGr!, lang) }) };
    }
    return { value: c.value, note: t(row.month === 'sale' ? 'edit.clampedMinSale' : 'edit.clampedMin', params) };
  };
  const constrain = list?.flex.requested ? constrainRow : undefined;
  const constrainBase =
    list?.flex.requested
      ? (value: bigint) => {
          const min = ceil(list.floor);
          const max = list.input.maxPriceGr;
          if (value < min) return { value: min, note: t('edit.clampedTopMin', { value: money(min, lang) }) };
          if (max !== undefined && max >= min && value > max) {
            return { value: max, note: t('edit.clampedTopMax', { value: money(max, lang) }) };
          }
          return { value };
        }
      : undefined;

  /** Individually: only this row changes. Otherwise the row's base shifts and all rows sharing it follow. */
  const editRow = (key: string, requested?: bigint) => {
    const row = list?.rows.find((r) => r.key === key);
    const value = requested !== undefined && row && constrain ? constrain(row, requested).value : requested;
    if (value === undefined || state.editIndividually || !row) {
      dispatch({ type: 'setRowOverride', key, value });
    } else {
      dispatch({ type: 'setOverrides', overrides: shiftOverrides(row, value, state.overrides, list) });
    }
  };
  // In flexible mode sale and regular prices are linked: a reset clears every shift.
  const resetShift = (sale: boolean) =>
    list?.flex.requested
      ? dispatch({ type: 'setOverrides', overrides: { rows: state.overrides.rows } })
      : sale
        ? dispatch({ type: 'setOverrides', overrides: { ...state.overrides, saleBase: undefined } })
        : dispatch({ type: 'setBaseOverride' });
  const maxPriceError =
    input.maxPrice.trim() === ''
      ? undefined
      : !maxPrice.ok
        ? t(`parse.${maxPrice.error}`)
        : maxPrice.value <= 0n
          ? t('issues.maxPriceNonPositive')
          : undefined;

  async function exportXlsx() {
    if (!list) return;
    if (!input.name.trim()) {
      setNameError(true);
      document.getElementById(fieldId('input.name'))?.focus();
      return;
    }
    const errors = list.rows.filter((r) => r.status === 'error').length;
    if (errors > 0 && !(await confirmDialog(t('export.confirmErrors', { count: errors }), t('app.title')))) return;
    const stale = list.rows.filter((r) => r.stale).length;
    if (stale > 0 && !(await confirmDialog(t('export.confirmStale', { count: stale }), t('app.title')))) return;

    try {
      // ExcelJS is large: load it only when exporting.
      const { priceListXlsx } = await import('../export/xlsx');
      const content = await priceListXlsx({
        list,
        config,
        lang,
        t: (key, params) => t(key, params),
        productName: input.name.trim(),
        date: new Date(),
        issueText: (issue) => issueMessage(issue, lang, t),
        calendarMonthNames: t('months.names', { returnObjects: true }) as string[],
      });
      const file = await saveBinaryFile(
        exportFileName(input.name, new Date(), t('export.fallbackName')),
        content,
        { name: 'Excel', extensions: ['xlsx'] },
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      if (file) setExportMessage({ ok: true, text: t('export.done', { file }) });
    } catch (e) {
      setExportMessage({ ok: false, text: t('export.failed', { error: String(e) }) });
    }
  }

  const settingsBlocked = result?.ok === false && result.issues.some((i) => !i.path?.startsWith('input.'));

  return (
    <Stack gap="xl">
      <div>
        <StepHeader step={1} title={t('steps.product')} subtitle={t('steps.productHint')} />
        <Paper p="lg">
          <Group align="flex-start" gap="md" wrap="wrap">
          <TextInput
            id={fieldId('input.name')}
            label={t('input.name')}
            placeholder={t('input.namePlaceholder')}
            value={input.name}
            onChange={(e) => {
              setNameError(false);
              setInput('name')(e);
            }}
            error={nameError ? t('input.nameRequired') : undefined}
            w={300}
          />
          <TextInput
            id={fieldId('input.costGr')}
            label={t('input.cost')}
            value={input.cost}
            onChange={setInput('cost')}
            inputMode="decimal"
            rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
            error={fieldError('input.costGr', cost, input.cost)}
            w={220}
          />
          <TextInput
            id={fieldId('input.qty')}
            label={t('input.qty')}
            description={t('input.qtyHint')}
            value={input.qty}
            onChange={setInput('qty')}
            inputMode="numeric"
            rightSection={<Text size="xs">{t('common.pcs')}</Text>}
            error={fieldError('input.qty', qty, input.qty)}
            w={220}
          />
          <TextInput
            id={fieldId('input.maxPriceGr')}
            label={t('input.maxPrice')}
            description={t('input.maxPriceHint')}
            value={input.maxPrice}
            onChange={setInput('maxPrice')}
            inputMode="decimal"
            rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
            error={maxPriceError}
            w={250}
          />
          </Group>
        </Paper>
      </div>

      {state.clearedOverrides > 0 && (
        <Alert color="blue" variant="light" withCloseButton onClose={() => dispatch({ type: 'dismissCleared' })}>
          {t('details.overridesCleared', { count: state.clearedOverrides })}
        </Alert>
      )}

      {!list && !settingsBlocked && (
        <Paper p="xl" shadow="none" className="empty-state" ta="center" data-testid="empty-state">
          <Stack gap={6} align="center">
            <Title order={4}>{t('empty.title')}</Title>
            <Text c="dimmed" maw={460} size="sm">
              {t('empty.text')}
            </Text>
          </Stack>
        </Paper>
      )}

      {settingsBlocked && result?.ok === false && (
        <IssueList
          issues={result.issues.filter((i) => !i.path?.startsWith('input.'))}
          lang={lang}
          onGoTo={onGoTo}
          title={t('issues.fixSettings')}
        />
      )}

      {list && (
        <>
          <div className="rise-in">
          <StepHeader step={2} title={t('steps.result')} subtitle={t('steps.resultHint')} />
          <Stack gap="sm">
          <Summary
            list={list}
            config={config}
            lang={lang}
            editable={state.showDetails}
            onEditBase={(value) => dispatch({ type: 'setBaseOverride', value })}
            constrainBase={constrainBase}
          />
          <IssueList issues={list.issues} lang={lang} onGoTo={onGoTo} />
          </Stack>
          </div>

          <div className="rise-in">
            <StepHeader
              step={3}
              title={t('steps.priceList')}
              subtitle={t('steps.priceListHint')}
              right={
                <Group gap="sm" wrap="nowrap">
                  <Tooltip label={t('flex.tooltip')} multiline w={340} withArrow>
                    <Switch
                      label={t('flex.label')}
                      checked={state.flexible}
                      onChange={(e) => dispatch({ type: 'setFlexible', value: e.currentTarget.checked })}
                      data-testid="toggle-flex"
                    />
                  </Tooltip>
                  <Button onClick={exportXlsx} data-testid="export-xlsx" radius="xl">
                    {t('export.xlsx')}
                  </Button>
                </Group>
              }
            />
            <Paper p="lg">
            <Stack gap="sm">
              {exportMessage && (
                <Text size="sm" c={exportMessage.ok ? 'teal' : 'red'} data-testid="export-message">
                  {exportMessage.text}
                </Text>
              )}
              <PriceMatrix
                list={list}
                config={config}
                lang={lang}
                month={month}
                currentMonth={currentMonth}
                onMonth={setMonth}
                onSelect={(r) => setSelectedKey(r.key)}
              />
            </Stack>
            </Paper>
          </div>

          <Switch
            label={t('details.show')}
            checked={state.showDetails}
            onChange={(e) => dispatch({ type: 'setShowDetails', value: e.currentTarget.checked })}
            data-testid="toggle-details"
          />

          {state.showDetails && (
            <div className="rise-in">
            <StepHeader
              step={4}
              title={t('steps.details')}
              subtitle={t('steps.detailsHint')}
              right={
                  <Group gap="md">
                    <Checkbox
                      label={t('edit.individually')}
                      checked={state.editIndividually}
                      onChange={(e) => dispatch({ type: 'setEditIndividually', value: e.currentTarget.checked })}
                    />
                    <Checkbox
                      label={t('details.smartUpdates')}
                      description={t('details.smartUpdatesHint')}
                      checked={state.smartUpdates}
                      onChange={(e) => dispatch({ type: 'setSmartUpdates', value: e.currentTarget.checked })}
                      data-testid="toggle-smart"
                    />
                    {overrideCount > 0 && (
                      <Button variant="light" color="yellow" size="xs" onClick={() => dispatch({ type: 'resetOverrides' })}>
                        {t('details.overrides', { count: overrideCount })} · {t('details.resetOverrides')}
                      </Button>
                    )}
                  </Group>
              }
            />
            <Paper p="lg">
              <Stack gap="sm">
                <PriceTable
                  rows={list.rows}
                  config={config}
                  lang={lang}
                  onSelect={(r) => setSelectedKey(r.key)}
                  onEdit={editRow}
                  constrain={constrain}
                />
              </Stack>
            </Paper>
            </div>
          )}

          <Breakdown
            list={list}
            row={selected}
            config={config}
            lang={lang}
            onClose={() => setSelectedKey(undefined)}
            onEdit={editRow}
            individually={state.editIndividually}
            constrain={constrain}
            onIndividually={(value) => dispatch({ type: 'setEditIndividually', value })}
            onResetShift={resetShift}
          />
        </>
      )}
    </Stack>
  );
}
