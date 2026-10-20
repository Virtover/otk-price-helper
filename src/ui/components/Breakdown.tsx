import { Badge, Divider, Drawer, Group, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { explainRow } from '../../core/explain';
import type { Locale } from '../../core/money';
import type { Config, PriceList, PriceRow } from '../../core/types';
import { customerLabel, formatParams, formatStepValue, monthLabel } from '../format';
import { PriceEditor } from './PriceEditor';
import { STATUS_COLOR } from './status';

interface Props {
  list: PriceList;
  row: PriceRow | undefined;
  config: Config;
  lang: Locale;
  onClose: () => void;
  onEdit: (key: string, value?: bigint) => void;
  individually: boolean;
  onIndividually: (value: boolean) => void;
  /** Reset the shifted base (sale base for sale rows). */
  onResetShift: (sale: boolean) => void;
}

/** "Why this price?" — the full derivation of one row. */
export function Breakdown(props: Props) {
  const { list, row, config, lang, onClose, onEdit, individually, onIndividually, onResetShift } = props;
  const { t } = useTranslation();
  const steps = row ? explainRow(list, row, config) : [];
  const calculated = steps.find((s) => s.key === 'netOverride')?.params?.calculated;

  return (
    <Drawer
      opened={row !== undefined}
      onClose={onClose}
      position="right"
      size="lg"
      title={
        <Text fw={700} size="lg">
          {t('breakdown.title')}
        </Text>
      }
    >
      {row && (
        <Stack gap="sm" data-testid="breakdown">
          <Group justify="space-between">
            <Text fw={600}>
              {t('breakdown.subtitle', {
                qty: row.qty === 1n ? t('matrix.single') : t('matrix.units', { qty: row.qty.toString() }),
                customer: customerLabel(config.customers, row.customerId, lang),
                month: monthLabel(config, row.month, lang, t),
              })}
            </Text>
            <Badge variant="light" color={STATUS_COLOR[row.status] ?? 'gray'}>
              {t(`status.${row.status}`)}
            </Badge>
          </Group>
          <PriceEditor
            row={row}
            calculated={calculated && typeof calculated === 'object' && 'money' in calculated ? calculated.money : undefined}
            lang={lang}
            onEdit={onEdit}
            individually={individually}
            onIndividually={onIndividually}
            shifted={row.month === 'sale' ? list.sale.baseOverridden : list.baseOverridden}
            onResetShift={() => onResetShift(row.month === 'sale')}
          />
          <Divider />
          <Table verticalSpacing={4} fz="sm">
            <Table.Tbody>
              {steps.map((s, i) => (
                <Table.Tr key={`${s.key}-${i}`}>
                  <Table.Td c={s.note ? 'dimmed' : undefined} fs={s.note ? 'italic' : undefined}>
                    {t(`breakdown.${s.key}`, formatParams(s.params, lang, t))}
                  </Table.Td>
                  <Table.Td
                    ta="right"
                    c={s.note ? 'dimmed' : undefined}
                    fw={['netUnit', 'netOverride', 'base', 'floor', 'unitCost'].includes(s.key) ? 700 : undefined}
                    style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.value ? formatStepValue(s.value, lang) : ''}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Drawer>
  );
}
