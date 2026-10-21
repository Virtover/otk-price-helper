import { ActionIcon, Group, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney, formatMoneyInput, parseMoney } from '../../core/money';

interface Props {
  value: bigint;
  overridden: boolean;
  lang: Locale;
  /** New value, or undefined to revert to the calculated one. */
  onCommit: (value?: bigint) => void;
  testId: string;
  fw?: number;
  /** Adjusts the entered value to the allowed range; `note` explains a change. */
  constrain?: (value: bigint) => { value: bigint; note?: string };
}

/** A price that turns into an input on click. Enter/blur applies, Escape cancels. */
export function EditablePrice({ value, overridden, lang, onCommit, testId, fw = 600, constrain }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();

  const commit = () => {
    const r = parseMoney(text);
    if (!r.ok) return setError(t(`parse.${r.error}`));
    if (r.value <= 0n) return setError(t('issues.costNonPositive'));
    const c = constrain?.(r.value);
    const next = c?.value ?? r.value;
    setNote(c && c.value !== r.value ? c.note : undefined);
    setEditing(false);
    setError(undefined);
    if (next !== value) onCommit(next);
  };

  if (editing) {
    return (
      <TextInput
        size="xs"
        autoFocus
        w={110}
        value={text}
        error={error}
        data-testid={`${testId}-input`}
        aria-label={t('edit.netUnit')}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setEditing(false);
            setError(undefined);
          }
        }}
      />
    );
  }

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setText(formatMoneyInput(value, lang));
    setNote(undefined);
    setEditing(true);
  };

  return (
    <Stack gap={0} align="flex-end">
    <Group gap={2} wrap="nowrap">
      <UnstyledButton
        data-testid={testId}
        fw={fw}
        style={{ borderBottom: '1px dashed var(--mantine-color-dimmed)', fontVariantNumeric: 'tabular-nums' }}
        onClick={startEditing}
      >
        {formatMoney(value, lang)}
      </UnstyledButton>
      <Tooltip label={t('edit.edit')}>
        <ActionIcon size="xs" variant="subtle" aria-label={t('edit.edit')} data-testid={`${testId}-pencil`} onClick={startEditing}>
          ✎
        </ActionIcon>
      </Tooltip>
      {overridden && (
        <Tooltip label={t('edit.reset')}>
          <ActionIcon
            size="xs"
            variant="subtle"
            aria-label={t('edit.reset')}
            data-testid={`${testId}-reset`}
            onClick={(e) => {
              e.stopPropagation();
              onCommit(undefined);
            }}
          >
            ↺
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
      {note && (
        <Text size="xs" c="orange.8" maw={260} ta="right" data-testid={`${testId}-note`}>
          {note}
        </Text>
      )}
    </Stack>
  );
}
