import { Badge, Box, Group, ScrollArea, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney } from '../../core/money';
import { monthIds, rowKey } from '../../core/pricing';
import type { Config, MonthType, PriceList, PriceRow } from '../../core/types';
import { monthLabel } from '../format';
import { STATUS_COLOR, statusBg } from './status';

interface Props {
  list: PriceList;
  config: Config;
  lang: Locale;
  month: MonthType;
  currentMonth: MonthType;
  onMonth: (m: MonthType) => void;
  onSelect: (row: PriceRow) => void;
}

/** Package tiers × customer types for one month type. */
export function PriceMatrix({ list, config, lang, month, currentMonth, onMonth, onSelect }: Props) {
  const { t } = useTranslation();
  const byKey = new Map(list.rows.map((r) => [r.key, r]));

  return (
    <Stack gap="sm">
      <ScrollArea type="auto">
        <SegmentedControl
          radius="xl"
          value={month}
          onChange={(v) => onMonth(v as MonthType)}
          data-testid="month-selector"
          data={monthIds(config).map((m) => {
            const label = monthLabel(config, m, lang, t);
            return { value: m, label: m === currentMonth ? `${label} • ${t('months.current')}` : label };
          })}
        />
      </ScrollArea>
      <Text size="xs" c="dimmed">
        {t('matrix.cellHint')}
      </Text>
      <ScrollArea type="auto">
        <Table
          withTableBorder
          withColumnBorders
          verticalSpacing={0}
          horizontalSpacing="sm"
          style={{ width: 'auto' }}
          data-testid="price-matrix"
        >
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
            {list.tiers.map((tier) => (
              <Table.Tr key={tier.qty.toString()}>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>
                  {tier.implicit ? t('matrix.single') : t('matrix.units', { qty: tier.qty.toString() })}
                </Table.Th>
                {config.customers.map((c) => {
                  const row = byKey.get(rowKey(tier.qty, c.id, month))!;
                  return (
                    <Table.Td key={c.id} p={0} bg={statusBg(row.status)}>
                      <UnstyledButton
                        w="100%"
                        px="sm"
                        py={4}
                        className={row.aboveMax ? 'price-cell above-max' : 'price-cell'}
                        onClick={() => onSelect(row)}
                        data-testid={`cell-${row.key}`}
                        data-status={row.status}
                        data-above-max={row.aboveMax || undefined}
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                      >
                        <Text size="sm">
                          {row.aboveMax && (
                            <Text span c="orange.7" fw={700} inherit>
                              ▲{' '}
                            </Text>
                          )}
                          <Text span fw={700} inherit c={row.aboveMax ? 'orange.7' : undefined}>
                            {formatMoney(row.netUnit, lang)}
                          </Text>
                          {!tier.implicit && ` / ${formatMoney(row.netTotal, lang)}`}
                          {row.stale && ' *'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t('summary.gross')} {formatMoney(row.grossUnit, lang)}
                          {!tier.implicit && ` / ${formatMoney(row.grossTotal, lang)}`}
                        </Text>
                      </UnstyledButton>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          {t('status.legend')}:
        </Text>
        {(['anchor', 'sale', 'override', 'error'] as const).map((s) => (
          <Badge key={s} size="sm" variant="light" color={STATUS_COLOR[s]}>
            {t(`status.${s}`)}
          </Badge>
        ))}
        {list.input.maxPriceGr !== undefined && (
          <Badge size="sm" variant="outline" color="orange">
            ▲ {t('status.aboveMax')}
          </Badge>
        )}
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">
          {t('matrix.clickHint')}
        </Text>
      </Group>
    </Stack>
  );
}
