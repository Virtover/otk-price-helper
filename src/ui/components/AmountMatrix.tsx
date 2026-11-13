import { Badge, Button, Collapse, Group, ScrollArea, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney, formatMoneyInput, parseMoney } from '../../core/money';
import { amountKey, monthIds, rowKey } from '../../core/pricing';
import { type AmountMatrix as Amounts, type Config, type Issue, type MonthType, type PriceList, SALE } from '../../core/types';
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

/**
 * What each cell actually takes off its month's retail price (1 unit · first customer), per month type.
 * Only while the flexible price list compresses prices — otherwise every cell is exactly its amount.
 * Returns the cells where some month differs from the amount.
 */
export function actualAmounts(list: PriceList & { amounts: Amounts }, config: Config): Map<string, [MonthType, bigint][]> {
  const actual = new Map<string, [MonthType, bigint][]>();
  if (!list.flex.active && !list.flex.saleActive) return actual;
  const net = new Map(list.rows.map((r) => [r.key, r.netUnit]));
  const first = config.customers[0]!.id;
  for (const [key, cell] of Object.entries(list.amounts.cells)) {
    const [qty, customer] = key.split('|') as [string, string];
    const perMonth = monthIds(config).flatMap((month): [MonthType, bigint][] => {
      const retail = net.get(rowKey(1n, first, month));
      const price = net.get(rowKey(BigInt(qty), customer, month));
      return retail === undefined || price === undefined ? [] : [[month, retail - price]];
    });
    if (perMonth.some(([, v]) => v !== cell.gr)) actual.set(key, perMonth);
  }
  return actual;
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
  const actual = actualAmounts(list, config);
  /** Regular months as one value (a 1 gr spread is only rounding) or a range; the sale separately. */
  const summary = (perMonth: [MonthType, bigint][], amount: bigint) => {
    const regular = perMonth.filter(([m]) => m !== SALE).map(([, v]) => v);
    const sale = perMonth.find(([m]) => m === SALE)?.[1];
    const lo = regular.reduce((a, b) => (b < a ? b : a), regular[0] ?? 0n);
    const hi = regular.reduce((a, b) => (b > a ? b : a), regular[0] ?? 0n);
    const regularText =
      regular.length === 0 || regular.every((v) => v === amount)
        ? undefined
        : hi - lo <= 1n
          ? money(regular[0]!, lang)
          : lang === 'pl'
            ? `${formatMoney(lo, lang)}–${money(hi, lang)}`
            : `${money(lo, lang)}–${formatMoney(hi, lang)}`;
    const saleText = sale === undefined || sale === amount ? undefined : money(sale, lang);
    return { regularText, saleText };
  };

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
          {actual.size > 0 && (
            <Text size="xs" className="amount-actual-note" data-testid="amounts-actual-note">
              {t('amounts.actualNote')}
            </Text>
          )}
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
                        const real = actual.get(key);
                        const tip = (
                          <Stack gap={4}>
                            <Text size="xs">
                              {warning ? issueMessage(warning, lang, t) : t('amounts.autoValue', { value: money(cell.auto, lang) })}
                            </Text>
                            {real && (
                              <>
                                <Text size="xs" fw={700}>
                                  {t('amounts.actualTitle')}
                                </Text>
                                <table className="calc-lines">
                                  <tbody>
                                    {real.map(([month, value]) => (
                                      <tr key={month}>
                                        <td>{monthLabel(config, month, lang, t)}</td>
                                        <td>{money(value, lang)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </Stack>
                        );
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
                              label={tip}
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
                                {real &&
                                  (() => {
                                    const { regularText, saleText } = summary(real, cell.gr);
                                    return (
                                      <Stack gap={0} mt={2} className="amount-actual num" data-testid={`amount-actual-${key}`}>
                                        {regularText && <Text size="xs">{t('amounts.actual', { value: regularText })}</Text>}
                                        {saleText && <Text size="xs">{t('amounts.actualSale', { value: saleText })}</Text>}
                                      </Stack>
                                    );
                                  })()}
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
