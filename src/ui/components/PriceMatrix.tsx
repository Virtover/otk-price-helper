import { Badge, Box, Group, ScrollArea, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { type Locale, formatMoney } from '../../core/money';
import { monthIds, rowKey } from '../../core/pricing';
import { rat } from '../../core/rational';
import { type MonthRetail, monthRetail, retailDiscount } from '../../core/retail';
import type { Config, MonthType, PriceList, PriceRow } from '../../core/types';
import { amountOff, money, monthLabel, pct, pctOff, scrubMoney } from '../format';
import { type RowScrub, nudged, scrubStep, startScrub } from '../scrub';
import type { PriceView } from '../state';
import { STATUS_COLOR, statusBg } from './status';

/** One line of a cell: per-unit value, optional whole-package value and a trailing remark. */
interface CellLine {
  label?: string;
  unit: string;
  pkg?: string;
  tail?: string;
}

/** " / package value" (softer than the per-unit value, see .pkg-value), then " · tail". */
function PackagePart({ line }: { line: CellLine }) {
  return (
    <>
      {line.pkg && (
        <>
          <span className="pkg-sep"> / </span>
          <span className="pkg-value">{line.pkg}</span>
        </>
      )}
      {line.tail && ` · ${line.tail}`}
    </>
  );
}

interface Props {
  list: PriceList;
  config: Config;
  lang: Locale;
  month: MonthType;
  currentMonth: MonthType;
  onMonth: (m: MonthType) => void;
  onSelect: (row: PriceRow) => void;
  /** Right-button drag on a price: Ctrl = this combination only, otherwise shift every price. */
  scrub?: RowScrub;
  view: PriceView;
  onView: (view: PriceView) => void;
}

/** "4,51 zł (20,00 %) below the base price 22,57 zł" — how a month's retail price relates to the top price. */
export function retailRelation(list: PriceList, retail: MonthRetail, lang: Locale, t: TFunction): string {
  if (retail.belowTop === 0n) return t('matrix.relationEqual');
  const above = retail.belowTop < 0n;
  return t(above ? 'matrix.relationAbove' : 'matrix.relationBelow', {
    amount: money(above ? -retail.belowTop : retail.belowTop, lang),
    pct: pct(above ? rat(-retail.belowTopPct.n, retail.belowTopPct.d) : retail.belowTopPct, lang),
    top: money(list.topPrice, lang),
  });
}

/** Package tiers × customer types for one month type. */
export function PriceMatrix({ list, config, lang, month, currentMonth, onMonth, onSelect, scrub, view, onView }: Props) {
  const { t } = useTranslation();
  const byKey = new Map(list.rows.map((r) => [r.key, r]));
  const retail = monthRetail(list, config, month);
  const retailKey = rowKey(1n, config.customers[0]!.id, month);

  /** Cell text in the chosen view: [main line, dimmed line]; `pkg` is the whole-package value, shown in colour. */
  const cellText = (row: PriceRow, implicit: boolean): [CellLine, CellLine] => {
    const pkg = (value: string) => (implicit ? undefined : value);
    if (view === 'price' || row.key === retailKey) {
      return [
        { unit: formatMoney(row.netUnit, lang), pkg: pkg(formatMoney(row.netTotal, lang)) },
        view === 'price'
          ? { label: t('summary.gross'), unit: formatMoney(row.grossUnit, lang), pkg: pkg(formatMoney(row.grossTotal, lang)) }
          : { unit: t('matrix.retailRef') },
      ];
    }
    // Both lines describe the same discount: the chosen unit on top, its complement below.
    const d = retailDiscount(retail, row.netUnit, row.grossUnit);
    const net = { unit: amountOff(d.net, lang), pkg: pkg(amountOff(d.net * row.qty, lang)) };
    if (view === 'percent') return [{ unit: pctOff(d.pct, lang) }, { label: t('summary.net'), ...net }];
    return [net, { label: t('summary.gross'), unit: amountOff(d.gross!, lang), tail: pctOff(d.pct, lang) }];
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" gap="sm">
        <ScrollArea type="auto" style={{ flex: 1, minWidth: 0 }}>
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
        <SegmentedControl
          radius="xl"
          size="xs"
          value={view}
          onChange={(v) => onView(v as PriceView)}
          data-testid="price-view"
          data={(['price', 'amount', 'percent'] as const).map((v) => ({ value: v, label: t(`matrix.view.${v}`) }))}
        />
      </Group>
      {view !== 'price' && (
        <Text size="sm" data-testid="retail-info">
          {t('matrix.retailInfo', {
            month: monthLabel(config, month, lang, t),
            customer: config.customers[0]!.label[lang],
            net: money(retail.net, lang),
            gross: money(retail.gross, lang),
            relation: retailRelation(list, retail, lang, t),
          })}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t(view === 'amount' ? 'matrix.cellHintAmount' : view === 'percent' ? 'matrix.cellHintPercent' : 'matrix.cellHint')}
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
                  const [main, second] = cellText(row, tier.implicit);
                  return (
                    <Table.Td key={c.id} p={0} bg={statusBg(row.status)}>
                      <UnstyledButton
                        w="100%"
                        px="sm"
                        py={4}
                        className={row.aboveMax ? 'price-cell above-max' : 'price-cell'}
                        onClick={() => onSelect(row)}
                        onMouseDown={(e) => {
                          if (!scrub) return;
                          const from = row.netUnit;
                          const step = scrubStep(from);
                          let last = from;
                          const started = startScrub(e, {
                            onSteps: (steps, start) => {
                              const next = nudged(from, steps, step, 1n);
                              if (next !== last) scrub.set(row.key, (last = next), start.ctrl);
                            },
                            onCancel: scrub.cancel,
                            label: (steps, start) =>
                              [
                                scrubMoney(nudged(from, steps, step, 1n), from, lang),
                                t(start.ctrl ? 'scrub.one' : 'scrub.all'),
                                t('scrub.esc'),
                              ].join(' · '),
                          });
                          if (started) scrub.begin();
                        }}
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
                            {main.unit}
                          </Text>
                          <PackagePart line={main} />
                          {row.stale && ' *'}
                        </Text>
                        <Text size="xs" c="dimmed" className="cell-sub">
                          {second.label && `${second.label} `}
                          {second.unit}
                          <PackagePart line={second} />
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
