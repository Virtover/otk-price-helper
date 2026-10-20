import { Badge, Box, Group, ScrollArea, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney } from '../../core/money';
import { rowKey } from '../../core/pricing';
import { MONTH_TYPES, type Config, type MonthType, type PriceList, type PriceRow } from '../../core/types';
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
          data={MONTH_TYPES.map((m) => ({
            value: m,
            label: m === currentMonth ? `${t(`months.${m}`)} • ${t('months.current')}` : t(`months.${m}`),
          }))}
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
                        className="price-cell"
                        onClick={() => onSelect(row)}
                        data-testid={`cell-${row.key}`}
                        data-status={row.status}
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                      >
                        <Text size="sm">
                          <Text span fw={700} inherit>
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
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">
          {t('matrix.clickHint')}
        </Text>
      </Group>
    </Stack>
  );
}
