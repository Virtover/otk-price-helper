import { Alert, Button, Checkbox, Group, Paper, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { type Dispatch, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INTERNATIONAL, POLISH_EXCEL, type CsvLabels, priceListCsv } from '../core/csv';
import { exportFileName } from '../core/filename';
import { parseInteger, parseMoney } from '../core/money';
import { calculate } from '../core/pricing';
import type { MonthType, PriceRow, ProductInput } from '../core/types';
import { confirmDialog, saveTextFile } from '../lib/fileio';
import { Breakdown } from './components/Breakdown';
import { IssueList } from './components/IssueList';
import { PriceMatrix } from './components/PriceMatrix';
import { PriceTable } from './components/PriceTable';
import { Summary } from './components/Summary';
import { customerLabel, fieldId, issueMessage } from './format';
import { type Action, type AppState, countOverrides } from './state';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onGoTo: (path: string) => void;
}

export function CalculatorTab({ state, dispatch, onGoTo }: Props) {
  const { t } = useTranslation();
  const { lang, config, input } = state;
  const currentMonth = config.calendar[new Date().getMonth()] ?? 'peak';
  const [month, setMonth] = useState<MonthType>(currentMonth);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [nameError, setNameError] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string }>();

  const cost = parseMoney(input.cost);
  const qty = parseInteger(input.qty);
  const product: ProductInput | undefined =
    cost.ok && qty.ok ? { name: input.name, costGr: cost.value, qty: qty.value } : undefined;

  // product is a fresh object each render; recalculate only when its source strings change.
  const result = useMemo(
    () => (product ? calculate(product, config, state.overrides, { smartUpdates: state.smartUpdates }) : undefined),
    [input.cost, input.qty, config, state.overrides, state.smartUpdates],
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

  const editRow = (key: string, value?: bigint) => dispatch({ type: 'setRowOverride', key, value });

  async function exportCsv() {
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

    const labels: CsvLabels = {
      header: (c) => t(`columns.${c}`),
      customer: (id) => customerLabel(config.customers, id, lang),
      month: (m) => t(`months.${m}`),
      status: (r: PriceRow) => t(`status.${r.status}`) + (r.stale ? ` (${t('status.stale')})` : ''),
    };
    const csv = priceListCsv(list, labels, state.dialect === 'pl' ? POLISH_EXCEL : INTERNATIONAL);
    try {
      const file = await saveTextFile(exportFileName(input.name, new Date(), t('export.fallbackName')), csv, {
        name: 'CSV',
        extensions: ['csv'],
      });
      if (file) setExportMessage({ ok: true, text: t('export.done', { file }) });
    } catch (e) {
      setExportMessage({ ok: false, text: t('export.failed', { error: String(e) }) });
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Group align="flex-start" grow preventGrowOverflow={false} wrap="wrap">
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
            miw={200}
          />
          <TextInput
            id={fieldId('input.costGr')}
            label={t('input.cost')}
            value={input.cost}
            onChange={setInput('cost')}
            inputMode="decimal"
            rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
            error={fieldError('input.costGr', cost, input.cost)}
            miw={180}
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
            miw={160}
          />
        </Group>
      </Paper>

      {state.clearedOverrides > 0 && (
        <Alert color="blue" variant="light" withCloseButton onClose={() => dispatch({ type: 'dismissCleared' })}>
          {t('details.overridesCleared', { count: state.clearedOverrides })}
        </Alert>
      )}

      {result?.ok === false && result.issues.some((i) => !i.path?.startsWith('input.')) && (
        <IssueList
          issues={result.issues.filter((i) => !i.path?.startsWith('input.'))}
          lang={lang}
          onGoTo={onGoTo}
          title={t('issues.fixSettings')}
        />
      )}

      {list && (
        <>
          <Summary
            list={list}
            config={config}
            lang={lang}
            editable={state.showDetails}
            onEditBase={(value) => dispatch({ type: 'setBaseOverride', value })}
          />
          <IssueList issues={list.issues} lang={lang} onGoTo={onGoTo} />
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={4}>{t('matrix.package')} × {t('columns.customer')}</Title>
                <Group gap="sm">
                  {state.showDetails && (
                    <Select
                      size="xs"
                      aria-label={t('export.dialect')}
                      value={state.dialect}
                      allowDeselect={false}
                      onChange={(v) => dispatch({ type: 'setDialect', value: v === 'intl' ? 'intl' : 'pl' })}
                      data={[
                        { value: 'pl', label: t('export.dialectPl') },
                        { value: 'intl', label: t('export.dialectIntl') },
                      ]}
                      w={170}
                    />
                  )}
                  <Button onClick={exportCsv} data-testid="export-csv">
                    {t('export.csv')}
                  </Button>
                </Group>
              </Group>
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

          <Switch
            label={t('details.show')}
            checked={state.showDetails}
            onChange={(e) => dispatch({ type: 'setShowDetails', value: e.currentTarget.checked })}
            data-testid="toggle-details"
          />

          {state.showDetails && (
            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={4}>{t('details.table')}</Title>
                  <Group gap="md">
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
                </Group>
                <PriceTable
                  rows={list.rows}
                  config={config}
                  lang={lang}
                  onSelect={(r) => setSelectedKey(r.key)}
                  onEdit={editRow}
                />
              </Stack>
            </Paper>
          )}

          <Breakdown
            list={list}
            row={selected}
            config={config}
            lang={lang}
            editable={state.showDetails}
            onClose={() => setSelectedKey(undefined)}
            onEdit={editRow}
          />
        </>
      )}
    </Stack>
  );
}
