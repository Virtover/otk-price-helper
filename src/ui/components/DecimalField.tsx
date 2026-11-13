import { Stack, Text, TextInput, type TextInputProps } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseResult } from '../../core/money';
import { keepInPlace, nudged, scrubStep, startScrub } from '../scrub';

interface Props extends Omit<TextInputProps, 'value' | 'onChange' | 'error'> {
  value: bigint;
  format: (value: bigint) => string;
  parse: (text: string) => ParseResult;
  onValue: (value: bigint) => void;
  error?: ReactNode;
  warning?: ReactNode;
  /** false: only colour the field; the caller shows error/warning text elsewhere (narrow table cells). */
  inlineMessages?: boolean;
  /** Lowest value a right-button drag can reach (default 0). */
  scrubMin?: bigint;
}

/**
 * Text field for an exact decimal. Keeps the user's text while typing and
 * reports a parse error inline; the parsed value is only emitted when valid.
 */
export function DecimalField({
  value,
  format,
  parse,
  onValue,
  error,
  warning,
  w,
  inlineMessages = true,
  scrubMin = 0n,
  ...rest
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => format(value));
  const [parseError, setParseError] = useState<string>();

  useEffect(() => {
    const current = parse(text);
    if (!current.ok || current.value !== value) {
      setText(format(value));
      setParseError(undefined);
    }
    // Only external value changes should reformat the text.
  }, [value]);

  return (
    <Stack gap={2} w={w}>
      <TextInput
        {...rest}
        value={text}
        inputMode="decimal"
        title={t('scrub.hint')}
        onMouseDown={(e) => {
          const from = value;
          const step = scrubStep(from);
          let last = from;
          const at = (steps: number) => nudged(from, steps, step, scrubMin);
          startScrub(e, {
            onSteps: (steps) => {
              const next = at(steps);
              if (next !== last) onValue((last = next));
            },
            onCancel: () => last !== from && onValue((last = from)),
            label: (steps) => {
              const next = at(steps);
              const diff = next - from;
              return `${format(next)} (${diff < 0n ? '−' : '+'}${format(diff < 0n ? -diff : diff)}) · ${t('scrub.esc')}`;
            },
          });
        }}
        error={parseError ?? (inlineMessages ? error : !!error)}
        onChange={(e) => {
          const input = e.currentTarget;
          const next = input.value;
          setText(next);
          const r = parse(next);
          if (r.ok) {
            setParseError(undefined);
            if (r.value !== value) keepInPlace(input, () => onValue(r.value));
          } else setParseError(t(`parse.${r.error}`));
        }}
      />
      {inlineMessages && warning && !parseError && !error && (
        <Text size="xs" c="orange.7">
          {warning}
        </Text>
      )}
    </Stack>
  );
}
