import { Anchor, Badge, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../../core/money';
import type { Config, PriceList } from '../../core/types';
import { money, moneyRat, pct } from '../format';
import { EditablePrice } from './EditablePrice';

interface Props {
  list: PriceList;
  config: Config;
  lang: Locale;
  editable: boolean;
  onEditBase: (value?: bigint) => void;
}

interface StatProps {
  label: string;
  hint: string;
  children: ReactNode;
  testId: string;
  highlight?: boolean;
}

function Stat({ label, hint, children, testId, highlight }: StatProps) {
  return (
    <Paper p="md" data-testid={testId} className={highlight ? 'card-highlight num' : 'num'}>
      <Text size="xs" c={highlight ? 'brand' : 'dimmed'} tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Paper>
  );
}

export function Summary({ list, config, lang, editable, onEditBase }: Props) {
  const { t } = useTranslation();
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      <Stat label={t('summary.unitCost')} hint={t('summary.unitCostHint')} testId="stat-unit-cost">
        <Text size="xl" fw={700}>
          {moneyRat(list.unitCost, lang)}
        </Text>
      </Stat>
      <Stat label={t('summary.floor')} hint={t('summary.floorHint')} testId="stat-floor">
        <Text size="xl" fw={700}>
          {moneyRat(list.floor, lang)}
        </Text>
      </Stat>
      <Stat
        label={t('summary.base')}
        hint={t('summary.baseHint', { customer: config.customers[0]?.label[lang] ?? '' })}
        testId="stat-base"
        highlight
      >
        <Stack gap={0}>
          <Group gap={6} align="baseline">
            {editable ? (
              <Text size="xl" component="div">
                <EditablePrice
                  value={list.base}
                  overridden={list.baseOverridden}
                  lang={lang}
                  testId="edit-base"
                  fw={700}
                  onCommit={onEditBase}
                />
              </Text>
            ) : (
              <Text size="xl" fw={700}>
                {money(list.base, lang)}
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
          </Group>
          <Text size="sm">
            {money(list.baseGross, lang)} {t('summary.gross')}
          </Text>
          {list.baseOverridden && (
            <Anchor component="button" type="button" size="xs" onClick={() => onEditBase(undefined)}>
              {t('summary.resetBase', { value: money(list.baseCalculated, lang) })}
            </Anchor>
          )}
        </Stack>
      </Stat>
      <Stat label={t('summary.retailProfit')} hint={t('summary.retailProfitHint')} testId="stat-retail-profit">
        <Text size="xl" fw={700}>
          {pct(list.retailProfitPct, lang)}
        </Text>
      </Stat>
    </SimpleGrid>
  );
}
