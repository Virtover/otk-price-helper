import { Badge, Divider, Drawer, Group, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { explainRow } from '../../core/explain';
import type { Locale } from '../../core/money';
import type { Config, PriceList, PriceRow } from '../../core/types';
import { customerLabel, formatParams, formatStepValue } from '../format';
import { EditablePrice } from './EditablePrice';
import { STATUS_COLOR } from './status';

interface Props {
  list: PriceList;
  row: PriceRow | undefined;
  config: Config;
  lang: Locale;
  editable: boolean;
  onClose: () => void;
  onEdit: (key: string, value?: bigint) => void;
}

/** "Why this price?" — the full derivation of one row. */
export function Breakdown({ list, row, config, lang, editable, onClose, onEdit }: Props) {
  const { t } = useTranslation();
  const steps = row ? explainRow(list, row, config) : [];

  return (
    <Drawer opened={row !== undefined} onClose={onClose} position="right" size="lg" title={t('breakdown.title')}>
      {row && (
        <Stack gap="sm" data-testid="breakdown">
          <Group justify="space-between">
            <Text fw={600}>
              {t('breakdown.subtitle', {
                qty: row.qty === 1n ? t('matrix.single') : t('matrix.units', { qty: row.qty.toString() }),
                customer: customerLabel(config.customers, row.customerId, lang),
                month: t(`months.${row.month}`),
              })}
            </Text>
            <Badge variant="light" color={STATUS_COLOR[row.status] ?? 'gray'}>
              {t(`status.${row.status}`)}
            </Badge>
          </Group>
          {editable && (
            <Group gap="xs">
              <Text size="sm">{t('edit.netUnit')}:</Text>
              <EditablePrice
                value={row.netUnit}
                overridden={row.overridden}
                lang={lang}
                testId="breakdown-edit"
                onCommit={(v) => onEdit(row.key, v)}
              />
            </Group>
          )}
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
