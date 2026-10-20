import { ActionIcon, Group, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
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
}

/** A price that turns into an input on click. Enter/blur applies, Escape cancels. */
export function EditablePrice({ value, overridden, lang, onCommit, testId, fw = 600 }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const commit = () => {
    const r = parseMoney(text);
    if (!r.ok) return setError(t(`parse.${r.error}`));
    if (r.value <= 0n) return setError(t('issues.costNonPositive'));
    setEditing(false);
    setError(undefined);
    if (r.value !== value) onCommit(r.value);
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
    setEditing(true);
  };

  return (
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
  );
}
