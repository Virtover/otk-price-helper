import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  List,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { type Dispatch, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, cloneConfig } from '../config/defaults';
import { parseConfigFile, serializeConfig } from '../config/io';
import {
  formatBpInput,
  formatMoneyInput,
  formatMultiplierInput,
  parseInteger,
  parseMoney,
  parseMultiplierBp,
  parsePercentBp,
} from '../core/money';
import { MONTH_TYPES, type Config } from '../core/types';
import { validateConfig } from '../core/validate';
import { confirmDialog, openTextFile, saveTextFile } from '../lib/fileio';
import { DecimalField } from './components/DecimalField';
import { fieldId, issueMessage } from './format';
import { type Action, type AppState, isDirty } from './state';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

type Notice = { color: string; text: string; details?: string[] };

export function SettingsTab({ state, dispatch }: Props) {
  const { t } = useTranslation();
  const { config, lang } = state;
  const [notice, setNotice] = useState<Notice>();
  const issues = useMemo(() => validateConfig(config), [config]);
  const dirty = isDirty(state);
  const multiplierMode = config.ui.discountInput === 'multiplier';

  const update = (fn: (c: Config) => void) => {
    const next = cloneConfig(config);
    fn(next);
    dispatch({ type: 'setConfig', config: next });
  };

  const messageFor = (path: string, level: 'error' | 'warning') => {
    const issue = issues.find((i) => i.path === path && i.level === level);
    return issue ? issueMessage(issue, lang, t) : undefined;
  };
  const feedback = (path: string) => ({
    id: fieldId(path),
    error: messageFor(path, 'error'),
    warning: messageFor(path, 'warning'),
  });

  // Field factories ---------------------------------------------------------------
  const percentField = (path: string, label: string, bp: number, set: (v: number) => void, hint?: string) => (
    <DecimalField
      {...feedback(path)}
      label={label}
      description={hint}
      value={BigInt(bp)}
      format={(v) => formatBpInput(Number(v), lang)}
      parse={parsePercentBp}
      onValue={(v) => set(Number(v))}
      rightSection={<Text size="xs">%</Text>}
    />
  );
  const moneyField = (path: string, label: string, gr: number, set: (v: number) => void, hint?: string) => (
    <DecimalField
      {...feedback(path)}
      label={label}
      description={hint}
      value={BigInt(gr)}
      format={(v) => formatMoneyInput(v, lang)}
      parse={parseMoney}
      onValue={(v) => set(Number(v))}
      rightSection={<Text size="xs">{lang === 'pl' ? 'zł' : 'PLN'}</Text>}
    />
  );
  /** Discount shown as "% off" or as a price multiplier, stored as discount bp. */
  const discountField = (path: string, bp: number, set: (v: number) => void, label?: string) =>
    multiplierMode ? (
      <DecimalField
        key={`${path}-multiplier`}
        {...feedback(path)}
        label={label}
        aria-label={label ?? t('settings.multiplier')}
        value={BigInt(10000 - bp)}
        format={(v) => formatMultiplierInput(Number(v), lang)}
        parse={parseMultiplierBp}
        onValue={(v) => set(10000 - Number(v))}
        leftSection={<Text size="xs">×</Text>}
      />
    ) : (
      <DecimalField
        key={`${path}-percent`}
        {...feedback(path)}
        label={label}
        aria-label={label ?? t('settings.discount')}
        value={BigInt(bp)}
        format={(v) => formatBpInput(Number(v), lang)}
        parse={parsePercentBp}
        onValue={(v) => set(Number(v))}
        rightSection={<Text size="xs">%</Text>}
      />
    );

  // File actions ------------------------------------------------------------------
  const discardOk = async () => !dirty || confirmDialog(t('settings.confirmDiscard'), t('app.title'));

  async function save() {
    const path = await saveTextFile('otk-price-helper-config.json', serializeConfig(config), {
      name: 'JSON',
      extensions: ['json'],
    });
    if (path) {
      dispatch({ type: 'markSaved' });
      setNotice({ color: 'teal', text: `${t('settings.saved')}: ${path}` });
    }
  }

  async function load() {
    if (!(await discardOk())) return;
    const file = await openTextFile({ name: 'JSON', extensions: ['json'] });
    if (!file) return;
    const r = parseConfigFile(file.content);
    if (!r.ok) {
      setNotice({
        color: 'red',
        text: t(`settings.loadError.${r.error}`, { version: r.details[0] }),
        details: r.error === 'invalid' ? r.details : undefined,
      });
      return;
    }
    dispatch({ type: 'loadConfig', config: r.config });
    setNotice({
      color: 'teal',
      text: r.migratedFrom ? t('settings.migrated', { version: r.migratedFrom }) : t('settings.loaded'),
    });
  }

  async function reset() {
    if (!(await discardOk())) return;
    dispatch({ type: 'setConfig', config: cloneConfig(DEFAULT_CONFIG) });
    setNotice(undefined);
  }

  const months = [
    { key: 'peak', path: 'months.peakBp', bp: config.months.peakBp, set: (c: Config, v: number) => (c.months.peakBp = v) },
    ...([0, 1, 2] as const).map((i) => ({
      key: `pre${i + 1}`,
      path: `months.prePeakBp.${i}`,
      bp: config.months.prePeakBp[i],
      set: (c: Config, v: number) => (c.months.prePeakBp[i] = v),
    })),
  ];

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Title order={4}>{t('settings.file')}</Title>
            {dirty && (
              <Badge color="orange" variant="light" data-testid="unsaved-badge">
                {t('settings.unsaved')}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            <Button variant="default" onClick={load} data-testid="config-load">
              {t('settings.load')}
            </Button>
            <Button onClick={save} data-testid="config-save">
              {t('settings.save')}
            </Button>
            <Button variant="subtle" color="gray" onClick={reset} data-testid="config-reset">
              {t('settings.reset')}
            </Button>
          </Group>
        </Group>
        {notice && (
          <Alert mt="sm" color={notice.color} variant="light" withCloseButton onClose={() => setNotice(undefined)} data-testid="config-notice">
            {notice.text}
            {notice.details && (
              <List size="xs" mt={4}>
                {notice.details.map((d) => (
                  <List.Item key={d}>{d}</List.Item>
                ))}
              </List>
            )}
          </Alert>
        )}
      </Paper>

      <Section title={t('settings.costs')}>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {percentField('handling.percentBp', t('settings.handlingPercent'), config.handling.percentBp, (v) =>
            update((c) => (c.handling.percentBp = v)), t('settings.handlingPercentHint'))}
          {moneyField('handling.fixedGr', t('settings.handlingFixed'), config.handling.fixedGr, (v) =>
            update((c) => (c.handling.fixedGr = v)), t('settings.handlingFixedHint'))}
          {percentField('vatBp', t('settings.vat'), config.vatBp, (v) => update((c) => (c.vatBp = v)))}
          {percentField('minProfit.percentBp', t('settings.minProfitPercent'), config.minProfit.percentBp, (v) =>
            update((c) => (c.minProfit.percentBp = v)), t('settings.minProfitPercentHint'))}
          {moneyField('minProfit.fixedGr', t('settings.minProfitFixed'), config.minProfit.fixedGr, (v) =>
            update((c) => (c.minProfit.fixedGr = v)), t('settings.minProfitFixedHint'))}
        </SimpleGrid>
      </Section>

      <Section title={t('settings.discounts')} hint={t('settings.discountsHint')}>
        <Group gap="sm">
          <Text size="sm">{t('settings.inputMode')}:</Text>
          <SegmentedControl
            size="xs"
            value={config.ui.discountInput}
            data-testid="discount-mode"
            onChange={(v) => update((c) => (c.ui.discountInput = v === 'multiplier' ? 'multiplier' : 'percent'))}
            data={[
              { value: 'percent', label: t('settings.modePercent') },
              { value: 'multiplier', label: t('settings.modeMultiplier') },
            ]}
          />
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Stack gap="xs">
            <Title order={5}>{t('settings.packages')}</Title>
            <Table verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('settings.packageQty')}</Table.Th>
                  <Table.Th>{multiplierMode ? t('settings.multiplier') : t('settings.discount')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {config.packages.map((p, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <DecimalField
                        {...feedback(`packages.${i}.qty`)}
                        aria-label={t('settings.packageQty')}
                        value={BigInt(p.qty)}
                        format={(v) => v.toString()}
                        parse={parseInteger}
                        onValue={(v) => update((c) => (c.packages[i]!.qty = Number(v)))}
                      />
                    </Table.Td>
                    <Table.Td>
                      {discountField(`packages.${i}.discountBp`, p.discountBp, (v) =>
                        update((c) => (c.packages[i]!.discountBp = v)))}
                    </Table.Td>
                    <Table.Td>
                      <RemoveButton label={t('settings.remove')} onClick={() => update((c) => c.packages.splice(i, 1))} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Button
              variant="light"
              size="xs"
              onClick={() =>
                update((c) => {
                  const last = c.packages.reduce((m, p) => (p.qty > m.qty ? p : m), { qty: 0, discountBp: 0 });
                  c.packages.push({ qty: Math.max(2, last.qty * 2), discountBp: last.discountBp });
                })
              }
            >
              + {t('settings.addPackage')}
            </Button>
          </Stack>

          <Stack gap="xs">
            <Title order={5}>{t('settings.months')}</Title>
            <SimpleGrid cols={2}>
              {months.map((m) => (
                <div key={m.key}>{discountField(m.path, m.bp, (v) => update((c) => m.set(c, v)), t(`months.${m.key}`))}</div>
              ))}
            </SimpleGrid>
            <Title order={5} mt="sm">
              {t('settings.sale')}
            </Title>
            <DecimalField
              {...feedback('sale.factorBp')}
              label={t('settings.saleFactor')}
              description={multiplierMode ? t('settings.saleFactorHintMultiplier') : t('settings.saleFactorHintPercent')}
              value={BigInt(config.sale.factorBp)}
              format={(v) => (multiplierMode ? formatMultiplierInput(Number(v), lang) : formatBpInput(Number(v), lang))}
              parse={multiplierMode ? parseMultiplierBp : parsePercentBp}
              onValue={(v) => update((c) => (c.sale.factorBp = Number(v)))}
              key={`sale-${config.ui.discountInput}`}
              {...(multiplierMode
                ? { leftSection: <Text size="xs">×</Text> }
                : { rightSection: <Text size="xs">%</Text> })}
            />
          </Stack>
        </SimpleGrid>

        <Stack gap="xs">
          <Title order={5}>{t('settings.customers')}</Title>
          <Text size="xs" c="dimmed">
            {t('settings.customersHint')}
          </Text>
          <Table verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('settings.labelPl')}</Table.Th>
                <Table.Th>{t('settings.labelEn')}</Table.Th>
                <Table.Th>{multiplierMode ? t('settings.multiplier') : t('settings.discount')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {config.customers.map((cu, i) => {
                const labelError = messageFor(`customers.${i}.label`, 'error');
                return (
                  <Table.Tr key={cu.id}>
                    <Table.Td>
                      <TextInput
                        id={fieldId(`customers.${i}.label`)}
                        aria-label={t('settings.labelPl')}
                        value={cu.label.pl}
                        error={labelError}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          update((c) => (c.customers[i]!.label.pl = v));
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        aria-label={t('settings.labelEn')}
                        value={cu.label.en}
                        error={labelError ? ' ' : undefined}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          update((c) => (c.customers[i]!.label.en = v));
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      {discountField(`customers.${i}.discountBp`, cu.discountBp, (v) =>
                        update((c) => (c.customers[i]!.discountBp = v)))}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2} wrap="nowrap">
                        <Tooltip label={t('settings.moveUp')}>
                          <ActionIcon
                            variant="subtle"
                            disabled={i === 0}
                            aria-label={t('settings.moveUp')}
                            onClick={() => update((c) => swap(c.customers, i, i - 1))}
                          >
                            ↑
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t('settings.moveDown')}>
                          <ActionIcon
                            variant="subtle"
                            disabled={i === config.customers.length - 1}
                            aria-label={t('settings.moveDown')}
                            onClick={() => update((c) => swap(c.customers, i, i + 1))}
                          >
                            ↓
                          </ActionIcon>
                        </Tooltip>
                        <RemoveButton
                          label={t('settings.remove')}
                          onClick={() => update((c) => c.customers.splice(i, 1))}
                        />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {messageFor('customers', 'error') && (
            <Text size="sm" c="red">
              {messageFor('customers', 'error')}
            </Text>
          )}
          <Button
            id={fieldId('customers')}
            variant="light"
            size="xs"
            onClick={() =>
              update((c) => {
                const last = c.customers[c.customers.length - 1];
                c.customers.push({
                  id: `c${Date.now().toString(36)}`,
                  label: { pl: t('settings.newCustomer', { lng: 'pl' }), en: t('settings.newCustomer', { lng: 'en' }) },
                  discountBp: last?.discountBp ?? 0,
                });
              })
            }
          >
            + {t('settings.addCustomer')}
          </Button>
        </Stack>
      </Section>

      <Accordion variant="contained" radius="md">
        <Accordion.Item value="calendar">
          <Accordion.Control>{t('settings.calendar')}</Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" mb="sm">
              {t('settings.calendarHint')}
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }}>
              {config.calendar.map((m, i) => (
                <Select
                  key={i}
                  size="xs"
                  label={(t('months.names', { returnObjects: true }) as string[])[i]}
                  value={m}
                  allowDeselect={false}
                  onChange={(v) => v && update((c) => (c.calendar[i] = v as Config['calendar'][number]))}
                  data={MONTH_TYPES.map((mt) => ({ value: mt, label: t(`months.${mt}`) }))}
                />
              ))}
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>{title}</Title>
          {hint && (
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          )}
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip label={label}>
      <ActionIcon variant="subtle" color="red" aria-label={label} onClick={onClick}>
        ✕
      </ActionIcon>
    </Tooltip>
  );
}

function swap<T>(arr: T[], i: number, j: number) {
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}
