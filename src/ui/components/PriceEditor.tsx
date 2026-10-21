import { Alert, Button, Checkbox, Group, Paper, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoneyInput, parseMoney } from '../../core/money';
import { unitForPackageTotal } from '../../core/pricing';
import type { PriceRow } from '../../core/types';
import { money } from '../format';

/** Adjusts a requested unit price to the allowed range; `note` explains a change. */
export type Constrain = (row: PriceRow, unit: bigint) => { value: bigint; note?: string };

interface Props {
  row: PriceRow;
  /** Price before any manual edit, shown on the reset button. */
  calculated?: bigint;
  lang: Locale;
  onEdit: (key: string, value?: bigint) => void;
  individually: boolean;
  onIndividually: (value: boolean) => void;
  /** The base this row derives from was moved by an earlier shift edit. */
  shifted: boolean;
  onResetShift: () => void;
  /** Flexible mode: sale and regular prices are linked. */
  linked?: boolean;
  constrain?: Constrain;
}

type Mode = 'unit' | 'package';

/**
 * Explicit "change this price" box. By default an edit shifts every price that
 * shares this row's base (according to discounts); "edit individually" changes only this row.
 * Packages can be priced per unit or as a whole (snapped to an amount divisible by the quantity).
 * When the entered price is adjusted, the field shows the adjusted value and a note says why.
 */
export function PriceEditor(props: Props) {
  const { row, calculated, lang, onEdit, individually, onIndividually, shifted, onResetShift, linked, constrain } = props;
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('unit');
  const shown = (m: Mode) => (m === 'package' ? row.netTotal : row.netUnit);
  const [text, setText] = useState(() => formatMoneyInput(shown(mode), lang));
  const [error, setError] = useState<string>();
  const [notes, setNotes] = useState<string[]>([]);

  // Another combination: start over in per-unit mode.
  useEffect(() => {
    setMode('unit');
    setNotes([]);
  }, [row.key]);

  useEffect(() => {
    setText(formatMoneyInput(shown(mode), lang));
    setError(undefined);
  }, [row.key, row.netUnit, mode, lang]);

  const parsed = parseMoney(text);
  const changed = parsed.ok && parsed.value !== shown(mode);

  const apply = () => {
    if (!parsed.ok) return setError(t(`parse.${parsed.error}`));
    if (parsed.value <= 0n) return setError(t('issues.costNonPositive'));
    const next: string[] = [];
    let unit = parsed.value;
    if (mode === 'package') {
      unit = unitForPackageTotal(parsed.value, row.qty);
      if (unit * row.qty !== parsed.value) {
        next.push(
          t('edit.snappedPackage', {
            total: money(unit * row.qty, lang),
            qty: row.qty.toString(),
            unit: money(unit, lang),
          }),
        );
      }
    }
    const c = constrain?.(row, unit);
    if (c && c.value !== unit) {
      unit = c.value;
      if (c.note) {
        next.push(
          mode === 'package'
            ? `${c.note} ${t('edit.packageTotal', { total: money(unit * row.qty, lang), qty: row.qty.toString() })}`
            : c.note,
        );
      }
    }
    setNotes(next);
    // Show the value that will actually be used, even when the price does not change.
    setText(formatMoneyInput(mode === 'package' ? unit * row.qty : unit, lang));
    if (unit !== row.netUnit) onEdit(row.key, unit);
  };

  return (
    <Paper withBorder p="sm" radius="md" data-testid="price-editor">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm">
            {t('edit.title')}
          </Text>
          <Checkbox
            size="xs"
            radius="sm"
            label={t('edit.individually')}
            checked={individually}
            onChange={(e) => onIndividually(e.currentTarget.checked)}
            data-testid="price-editor-individually"
          />
        </Group>
        {row.qty > 1n && (
          <SegmentedControl
            size="xs"
            radius="xl"
            value={mode}
            onChange={(v) => {
              setMode(v === 'package' ? 'package' : 'unit');
              setNotes([]);
            }}
            data={[
              { value: 'unit', label: t('edit.perUnit') },
              { value: 'package', label: t('edit.perPackage', { qty: row.qty.toString() }) },
            ]}
            data-testid="price-editor-mode"
            style={{ alignSelf: 'flex-start' }}
          />
        )}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <TextInput
            aria-label={mode === 'package' ? t('edit.netPackage') : t('edit.netUnit')}
            w={150}
            value={text}
            error={error}
            inputMode="decimal"
            rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
            data-testid="price-editor-input"
            onChange={(e) => {
              setText(e.currentTarget.value);
              setError(undefined);
              setNotes([]);
            }}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
          <Button onClick={apply} disabled={!changed} data-testid="price-editor-apply">
            {t('edit.save')}
          </Button>
          {row.overridden ? (
            <Button variant="default" onClick={() => onEdit(row.key, undefined)} data-testid="price-editor-reset">
              {calculated !== undefined
                ? t('edit.resetTo', { value: money(calculated, lang) })
                : t('edit.reset')}
            </Button>
          ) : (
            shifted && (
              <Button variant="default" onClick={onResetShift} data-testid="price-editor-reset-shift">
                {t('edit.resetShift')}
              </Button>
            )
          )}
        </Group>
        {notes.length > 0 && (
          <Alert color="orange" variant="light" p="xs" data-testid="price-editor-notes">
            <Stack gap={2}>
              {notes.map((n) => (
                <Text key={n} size="xs">
                  {n}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
        <Text size="xs" c="dimmed" data-testid="price-editor-hint">
          {individually
            ? t('edit.individualHint')
            : linked
              ? t('edit.shiftLinkedHint')
              : row.month === 'sale'
                ? t('edit.shiftSaleHint')
                : t('edit.shiftHint')}
        </Text>
      </Stack>
    </Paper>
  );
}
