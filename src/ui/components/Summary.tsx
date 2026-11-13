import { Anchor, Badge, Box, Divider, Group, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../../core/money';
import { ceil, mul, rat } from '../../core/rational';
import type { Config, PriceList } from '../../core/types';
import { money, moneyRat, pct } from '../format';
import { EditablePrice } from './EditablePrice';

interface Props {
  list: PriceList;
  config: Config;
  lang: Locale;
  editable: boolean;
  onEditBase: (value?: bigint) => void;
  /** Adjusts an entered base price to the allowed range (flexible mode). */
  constrainBase?: (value: bigint) => { value: bigint; note?: string };
}

interface StatProps {
  label: string;
  hint: string;
  children: ReactNode;
  testId: string;
  highlight?: boolean;
  /** Explanation shown on hover (or focus) over the label with the info mark. */
  tip?: ReactNode;
}

const InfoMark = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="4.9" r="1" fill="currentColor" />
    <path d="M8 7.3v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function Stat({ label, hint, children, testId, highlight, tip }: StatProps) {
  const title = (
    <Group gap={5} wrap="nowrap">
      <Text size="xs" c={highlight ? 'brand' : 'dimmed'} tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
        {label}
      </Text>
      {tip && (
        <Text component="span" c="dimmed" lh={0} className="info-mark">
          <InfoMark />
        </Text>
      )}
    </Group>
  );
  return (
    <Paper p="md" data-testid={testId} className={highlight ? 'card-highlight num' : 'num'}>
      {tip ? (
        <Tooltip label={tip} multiline w={340} withArrow openDelay={150} position="bottom-start">
          <Box tabIndex={0} w="fit-content" className="stat-tip" data-testid={`${testId}-tip`}>
            {title}
          </Box>
        </Tooltip>
      ) : (
        title
      )}
      {children}
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Paper>
  );
}

type Line = [label: string, value: string];

/** Tooltip body: a small calculation (label · value lines, the last one the total), a formula and a note. */
function Calc({ lines = [], formula, note }: { lines?: Line[]; formula?: Line; note: string }) {
  return (
    <Stack gap={8} py={4} className="num">
      {lines.length > 0 && (
        <table className="calc-lines">
          <tbody>
            {lines.map(([label, value], i) => (
              <tr key={label} className={i === lines.length - 1 ? 'calc-total' : undefined}>
                <td>{label}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {formula && (
        <Box>
          <Text size="xs" fw={700}>
            {formula[0]}
          </Text>
          <Text size="xs">{formula[1]}</Text>
        </Box>
      )}
      {(lines.length > 0 || formula) && <Divider className="calc-divider" />}
      <Text size="xs" lh={1.45}>
        {note}
      </Text>
    </Stack>
  );
}

export function Summary({ list, config, lang, editable, onEditBase, constrainBase }: Props) {
  const { t } = useTranslation();
  const customer = config.customers[0]?.label[lang] ?? '';
  const month = config.months[0]?.label[lang] ?? '';
  const cost = list.input.costGr;
  const bpPct = (bp: number) => pct(rat(bp, 10000), lang);
  const { percentBp: handlingBp, fixedGr: handlingFixed } = config.handling;
  const feeBp = config.fees.percentBp;

  const unitCostLines: Line[] = [
    [t('summary.tip.purchase'), money(cost, lang)],
    ...(handlingBp > 0
      ? [[t('summary.tip.handlingPct', { pct: bpPct(handlingBp) }), moneyRat(mul(rat(cost), rat(handlingBp, 10000)), lang)] as Line]
      : []),
    ...(handlingFixed > 0
      ? [
          [
            t('summary.tip.handlingFixed', { fixed: money(BigInt(handlingFixed), lang), qty: list.input.qty.toString() }),
            money(ceil(rat(BigInt(handlingFixed), list.input.qty)), lang),
          ] as Line,
        ]
      : []),
    [t('summary.tip.unitCost'), moneyRat(list.unitCost, lang)],
  ];

  const floorLines: Line[] = [
    [t('summary.tip.unitCostShort'), moneyRat(list.unitCost, lang)],
    [t('summary.tip.minProfit'), moneyRat(list.minProfit, lang)],
    ...(feeBp > 0 ? [[t('summary.tip.feeDivide', { pct: bpPct(feeBp) }), ''] as Line] : []),
    [t('summary.tip.floor'), moneyRat(list.floor, lang)],
  ];

  // Markup and margin describe the base price row (1 unit · first customer · first month).
  const retail = list.rows.find((r) => r.key === list.retailKey)!;
  const profit = moneyRat(retail.profitUnit, lang);
  const profitLines: Line[] = [
    [t('summary.tip.price'), money(retail.netUnit, lang)],
    ...(feeBp > 0 ? [[t('summary.tip.fee'), moneyRat(retail.feeUnit, lang)] as Line] : []),
    [t('summary.tip.cost'), moneyRat(list.unitCost, lang)],
    [t('summary.tip.profit'), profit],
  ];
  const markupFormula: Line = [
    t('summary.tip.markupFormula'),
    `= ${profit} ÷ ${money(cost, lang)} = ${pct(list.retailProfitPct, lang)}`,
  ];
  const marginFormula: Line = [
    t('summary.tip.marginFormula'),
    `= ${profit} ÷ ${money(retail.netUnit, lang)} = ${pct(list.retailMarginPct, lang)}`,
  ];

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm">
      <Stat
        label={t('summary.unitCost')}
        hint={t('summary.unitCostHint')}
        testId="stat-unit-cost"
        tip={<Calc lines={unitCostLines} note={t('summary.tip.unitCostNote')} />}
      >
        <Text size="xl" fw={700}>
          {moneyRat(list.unitCost, lang)}
        </Text>
      </Stat>
      <Stat
        label={t('summary.floor')}
        hint={t('summary.floorHint')}
        testId="stat-floor"
        tip={<Calc lines={floorLines} note={t('summary.tip.floorNote')} />}
      >
        <Text size="xl" fw={700}>
          {moneyRat(list.floor, lang)}
        </Text>
      </Stat>
      <Stat
        label={t('summary.base')}
        hint={t('summary.baseHint', { customer, month })}
        testId="stat-base"
        highlight
        tip={<Calc note={t('summary.tip.baseNote', { customer, month })} />}
      >
        <Stack gap={0}>
          <Group gap={6} align="baseline">
            {editable ? (
              <Text size="xl" component="div">
                <EditablePrice
                  value={list.topPrice}
                  overridden={list.baseOverridden}
                  lang={lang}
                  testId="edit-base"
                  fw={700}
                  onCommit={onEditBase}
                  constrain={constrainBase}
                />
              </Text>
            ) : (
              <Text size="xl" fw={700}>
                {money(list.topPrice, lang)}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {t('summary.net')}
            </Text>
            {list.baseOverridden && (
              <Badge size="xs" color="yellow" variant="light">
                {t('summary.edited')}
              </Badge>
            )}
            {list.flex.active && (
              <Badge size="xs" color="teal" variant="light" data-testid="flex-badge">
                {t('flex.badge')}
              </Badge>
            )}
          </Group>
          <Text size="sm">
            {money(list.topPriceGross, lang)} {t('summary.gross')}
          </Text>
          {list.flex.active && (
            <Text size="xs" c="dimmed">
              {t('flex.nominal', { value: money(list.baseCalculated, lang) })}
            </Text>
          )}
          {list.baseOverridden && (
            <Anchor component="button" type="button" size="xs" onClick={() => onEditBase(undefined)}>
              {t('summary.resetBase', { value: money(list.baseCalculated, lang) })}
            </Anchor>
          )}
        </Stack>
      </Stat>
      <Stat
        label={t('summary.markup')}
        hint={t('summary.markupHint')}
        testId="stat-markup"
        tip={<Calc lines={profitLines} formula={markupFormula} note={t('summary.tip.markupNote')} />}
      >
        <Text size="xl" fw={700}>
          {pct(list.retailProfitPct, lang)}
        </Text>
        <Text size="sm">{t('summary.markupOf', { profit, cost: money(cost, lang) })}</Text>
      </Stat>
      <Stat
        label={t('summary.margin')}
        hint={t('summary.marginHint')}
        testId="stat-margin"
        tip={<Calc lines={profitLines} formula={marginFormula} note={t('summary.tip.marginNote')} />}
      >
        <Text size="xl" fw={700}>
          {pct(list.retailMarginPct, lang)}
        </Text>
        <Text size="sm">{t('summary.marginOf', { profit, price: money(retail.netUnit, lang) })}</Text>
      </Stat>
    </SimpleGrid>
  );
}
