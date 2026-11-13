import { Badge, Button, Collapse, Group, ScrollArea, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoneyInput, parseMoney } from '../../core/money';
import { amountKey } from '../../core/pricing';
import type { AmountMatrix as Amounts, Config, Issue, PriceList } from '../../core/types';
import { fieldId, issueMessage, money, monthLabel } from '../format';
import { DecimalField } from './DecimalField';

/** Window event that expands the matrix (sent before focusing one of its fields from a message). */
export const REVEAL_AMOUNTS = 'otk:reveal-amounts';

interface Props {
  list: PriceList & { amounts: Amounts };
  config: Config;
  lang: Locale;
  /** Sets a cell by hand; undefined returns it to the generated amount. */
  onSet: (key: string, value?: bigint) => void;
  onReset: () => void;
}

/** Amount mode: package × customer PLN amounts shared by all month types, generated and editable; collapsed by default. */
export function AmountMatrix({ list, config, lang, onSet, onReset }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const reveal = () => setOpened(true);
    window.addEventListener(REVEAL_AMOUNTS, reveal);
    return () => window.removeEventListener(REVEAL_AMOUNTS, reveal);
  }, []);
  const { amounts } = list;
  const manual = Object.values(amounts.cells).filter((c) => c.manual).length;
  const warnings = new Map<string, Issue>(
    list.issues.filter((i) => i.path?.startsWith('amounts.')).map((i) => [i.path!, i]),
  );

  return (
    <Stack gap="xs" data-testid="amount-matrix">
      <Group justify="space-between" gap="sm">
        <UnstyledButton onClick={() => setOpened((o) => !o)} aria-expanded={opened} data-testid="amounts-toggle">
          <Group gap="xs">
            <Text fw={600} w={12} ta="center" c="dimmed">
              {opened ? '▾' : '▸'}
            </Text>
            <Text fw={600}>{t('amounts.title')}</Text>
            <Badge variant="light" color={manual > 0 ? 'yellow' : 'gray'}>
              {manual > 0 ? t('amounts.manual', { count: manual }) : t('amounts.generated')}
            </Badge>
            {/* Warnings stay visible while the matrix is collapsed. */}
            {warnings.size > 0 && (
              <Badge variant="light" color="orange">
                {t('amounts.warnings', { count: warnings.size })}
              </Badge>
            )}
          </Group>
        </UnstyledButton>
        {manual > 0 && (
          <Button variant="default" size="xs" onClick={onReset} data-testid="amounts-reset">
            {t('amounts.regenerate')}
          </Button>
        )}
      </Group>
      <Collapse in={opened}>
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('amounts.hint', {
              month: monthLabel(config, amounts.refMonth, lang, t),
              retail: money(amounts.refRetail, lang),
            })}
          </Text>
          <ScrollArea type="auto">
            <Table withTableBorder withColumnBorders verticalSpacing={4} horizontalSpacing="xs" style={{ width: 'auto' }}>
              <Table.Thead className="matrix-head">
                <Table.Tr>
                  <Table.Th>{t('matrix.package')}</Table.Th>
                  {config.customers.map((c) => (
                    <Table.Th key={c.id} ta="right">
                      {c.label[lang]}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.tiers.map((tier) => {
                  const qtyLabel = tier.implicit ? t('matrix.single') : t('matrix.units', { qty: tier.qty.toString() });
                  return (
                    <Table.Tr key={tier.qty.toString()}>
                      <Table.Th style={{ whiteSpace: 'nowrap' }}>{qtyLabel}</Table.Th>
                      {config.customers.map((c) => {
                        const key = amountKey(tier.qty, c.id);
                        const cell = amounts.cells[key]!;
                        const warning = warnings.get(`amounts.${key}`);
                        return (
                          <Table.Td
                            key={c.id}
                            bg={
                              warning
                                ? 'var(--mantine-color-orange-light)'
                                : cell.manual
                                  ? 'var(--mantine-color-yellow-light)'
                                  : undefined
                            }
                          >
                            <Tooltip
                              label={warning ? issueMessage(warning, lang, t) : t('amounts.autoValue', { value: money(cell.auto, lang) })}
                              color={warning ? 'orange' : undefined}
                              multiline
                              w={260}
                              withArrow
                            >
                              <div>
                                <DecimalField
                                  id={fieldId(`amounts.${key}`)}
                                  w={92}
                                  size="xs"
                                  aria-label={t('amounts.cellLabel', { qty: qtyLabel, customer: c.label[lang] })}
                                  value={cell.gr}
                                  format={(v) => formatMoneyInput(v, lang)}
                                  parse={parseMoney}
                                  // Typing the generated amount back makes the cell generated again.
                                  onValue={(v) => onSet(key, v === cell.auto ? undefined : v)}
                                  inlineMessages={false}
                                  rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
                                  data-testid={`amount-${key}`}
                                />
                              </div>
                            </Tooltip>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Collapse>
    </Stack>
  );
}
