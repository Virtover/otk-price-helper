import { Stack, Text, TextInput, type TextInputProps } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseResult } from '../../core/money';

interface Props extends Omit<TextInputProps, 'value' | 'onChange' | 'error'> {
  value: bigint;
  format: (value: bigint) => string;
  parse: (text: string) => ParseResult;
  onValue: (value: bigint) => void;
  error?: ReactNode;
  warning?: ReactNode;
  /** false: only colour the field; the caller shows error/warning text elsewhere (narrow table cells). */
  inlineMessages?: boolean;
}

/**
 * Text field for an exact decimal. Keeps the user's text while typing and
 * reports a parse error inline; the parsed value is only emitted when valid.
 */
export function DecimalField({ value, format, parse, onValue, error, warning, w, inlineMessages = true, ...rest }: Props) {
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
        error={parseError ?? (inlineMessages ? error : !!error)}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          const r = parse(next);
          if (r.ok) {
            setParseError(undefined);
            if (r.value !== value) onValue(r.value);
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
