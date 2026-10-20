import { Button, Checkbox, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoneyInput, parseMoney } from '../../core/money';
import type { PriceRow } from '../../core/types';
import { money } from '../format';

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
}

/**
 * Explicit "change this price" box. By default an edit shifts every price that
 * shares this row's base (according to discounts); "edit individually" changes only this row.
 */
export function PriceEditor(props: Props) {
  const { row, calculated, lang, onEdit, individually, onIndividually, shifted, onResetShift } = props;
  const { t } = useTranslation();
  const [text, setText] = useState(() => formatMoneyInput(row.netUnit, lang));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setText(formatMoneyInput(row.netUnit, lang));
    setError(undefined);
  }, [row.key, row.netUnit, lang]);

  const parsed = parseMoney(text);
  const changed = parsed.ok && parsed.value !== row.netUnit;

  const apply = () => {
    if (!parsed.ok) return setError(t(`parse.${parsed.error}`));
    if (parsed.value <= 0n) return setError(t('issues.costNonPositive'));
    if (changed) onEdit(row.key, parsed.value);
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
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <TextInput
            aria-label={t('edit.netUnit')}
            w={140}
            value={text}
            error={error}
            inputMode="decimal"
            rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
            data-testid="price-editor-input"
            onChange={(e) => {
              setText(e.currentTarget.value);
              setError(undefined);
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
        <Text size="xs" c="dimmed" data-testid="price-editor-hint">
          {individually
            ? t('edit.individualHint')
            : row.month === 'sale'
              ? t('edit.shiftSaleHint')
              : t('edit.shiftHint')}
        </Text>
      </Stack>
    </Paper>
  );
}
