import { Badge, Group, ScrollArea, Select, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney } from '../../core/money';
import { type Rat, cmp, rat } from '../../core/rational';
import { monthIds } from '../../core/pricing';
import type { Config, PriceRow } from '../../core/types';
import { customerLabel, monthLabel, moneyRat, pct } from '../format';
import { EditablePrice } from './EditablePrice';
import type { Constrain } from './PriceEditor';
import { STATUS_COLOR, statusBg } from './status';

interface Props {
  rows: PriceRow[];
  config: Config;
  lang: Locale;
  onSelect: (row: PriceRow) => void;
  onEdit: (key: string, value?: bigint) => void;
  constrain?: Constrain;
}

const COLUMNS = [
  'qty',
  'customer',
  'month',
  'netUnit',
  'grossUnit',
  'netTotal',
  'grossTotal',
  'feeUnit',
  'profitUnit',
  'profitTotal',
  'profitPct',
  'nominalDiscount',
  'effectiveDiscount',
  'status',
] as const;
type Column = (typeof COLUMNS)[number];

const numeric = (r: PriceRow, col: Column): Rat | undefined => {
  switch (col) {
    case 'qty':
      return rat(r.qty);
    case 'netUnit':
      return rat(r.netUnit);
    case 'grossUnit':
      return rat(r.grossUnit);
    case 'netTotal':
      return rat(r.netTotal);
    case 'grossTotal':
      return rat(r.grossTotal);
    case 'feeUnit':
      return r.feeUnit;
    case 'profitUnit':
      return r.profitUnit;
    case 'profitTotal':
      return r.profitTotal;
    case 'profitPct':
      return r.profitPct;
    case 'nominalDiscount':
      return r.nominalDiscount;
    case 'effectiveDiscount':
      return r.effectiveDiscount;
    default:
      return undefined;
  }
};

/** Flat, filterable and sortable list of every combination — same rows as the XLSX export. */
export function PriceTable({ rows, config, lang, onSelect, onEdit, constrain }: Props) {
  const { t } = useTranslation();
  const [month, setMonth] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: Column; dir: 1 | -1 } | null>(null);
  const columns = COLUMNS.filter((c) => c !== 'feeUnit' || config.fees.percentBp > 0);

  const shown = useMemo(() => {
    const filtered = rows.filter((r) => (!month || r.month === month) && (!customer || r.customerId === customer));
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const x = numeric(a, sort.col);
      const y = numeric(b, sort.col);
      return x && y ? cmp(x, y) * sort.dir : 0;
    });
  }, [rows, month, customer, sort]);

  const toggleSort = (col: Column) => {
    if (!numeric(rows[0]!, col)) return;
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  };

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end">
        <Select
          label={t('details.filterMonth')}
          placeholder={t('details.all')}
          clearable
          size="xs"
          value={month}
          onChange={setMonth}
          data={monthIds(config).map((m) => ({ value: m, label: monthLabel(config, m, lang, t) }))}
        />
        <Select
          label={t('details.filterCustomer')}
          placeholder={t('details.all')}
          clearable
          size="xs"
          value={customer}
          onChange={setCustomer}
          data={config.customers.map((c) => ({ value: c.id, label: c.label[lang] }))}
        />
        <Text size="xs" c="dimmed">
          {t('details.rowsShown', { shown: shown.length, total: rows.length })}
        </Text>
      </Group>
      <ScrollArea h={480} type="auto">
        <Table striped highlightOnHover stickyHeader verticalSpacing={4} fz="xs" data-testid="price-table">
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th key={col} ta={numeric(rows[0]!, col) ? 'right' : 'left'} style={{ whiteSpace: 'nowrap' }}>
                  <UnstyledButton fz="xs" fw={700} onClick={() => toggleSort(col)}>
                    {t(`columns.${col}`)}
                    {sort?.col === col ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </UnstyledButton>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((r) => (
              <Table.Tr
                key={r.key}
                bg={statusBg(r.status)}
                onClick={() => onSelect(r)}
                style={{ cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
              >
                <Table.Td ta="right">{r.qty.toString()}</Table.Td>
                <Table.Td>{customerLabel(config.customers, r.customerId, lang)}</Table.Td>
                <Table.Td>{monthLabel(config, r.month, lang, t)}</Table.Td>
                <Table.Td ta="right">
                  <Group justify="flex-end">
                    <EditablePrice
                      value={r.netUnit}
                      overridden={r.overridden}
                      lang={lang}
                      testId={`edit-${r.key}`}
                      onCommit={(v) => onEdit(r.key, v)}
                      constrain={constrain && ((v) => constrain(r, v))}
                    />
                  </Group>
                </Table.Td>
                <Table.Td ta="right">{formatMoney(r.grossUnit, lang)}</Table.Td>
                <Table.Td ta="right">{formatMoney(r.netTotal, lang)}</Table.Td>
                <Table.Td ta="right">{formatMoney(r.grossTotal, lang)}</Table.Td>
                {config.fees.percentBp > 0 && <Table.Td ta="right">{moneyRat(r.feeUnit, lang)}</Table.Td>}
                <Table.Td ta="right">{moneyRat(r.profitUnit, lang)}</Table.Td>
                <Table.Td ta="right">{moneyRat(r.profitTotal, lang)}</Table.Td>
                <Table.Td ta="right">{pct(r.profitPct, lang)}</Table.Td>
                <Table.Td ta="right">{pct(r.nominalDiscount, lang)}</Table.Td>
                <Table.Td ta="right">{pct(r.effectiveDiscount, lang)}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Badge size="xs" variant="light" color={STATUS_COLOR[r.status] ?? 'gray'}>
                      {t(`status.${r.status}`)}
                    </Badge>
                    {r.stale && (
                      <Badge size="xs" variant="outline" color="gray">
                        {t('status.stale')}
                      </Badge>
                    )}
                    {r.aboveMax && (
                      <Badge size="xs" variant="outline" color="orange">
                        ▲ {t('status.aboveMax')}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
