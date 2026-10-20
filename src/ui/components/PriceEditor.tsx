import { Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
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
}

/** Explicit "change this price" box: net unit price input + apply / reset. */
export function PriceEditor({ row, calculated, lang, onEdit }: Props) {
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
        <Text fw={600} size="sm">
          {t('edit.title')}
        </Text>
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
          {row.overridden && (
            <Button variant="default" onClick={() => onEdit(row.key, undefined)} data-testid="price-editor-reset">
              {calculated !== undefined
                ? t('edit.resetTo', { value: money(calculated, lang) })
                : t('edit.reset')}
            </Button>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {t('edit.editHint')}
        </Text>
      </Stack>
    </Paper>
  );
}
