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
import { monthIds } from '../core/pricing';
import { type Config, type CustomerType, SALE } from '../core/types';
import { validateConfig } from '../core/validate';
import { confirmDialog, openTextFile, saveTextFile } from '../lib/fileio';
import { DecimalField } from './components/DecimalField';
import { fieldId, issueMessage, monthLabel } from './format';
import { type Action, type AppState, isDirty } from './state';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

type Notice = { color: string; text: string; details?: string[] };

/** Customer types and month types share this shape. */
type LabelledItem = CustomerType;

/** Field widths: values are 1–5 characters, hints wrap under the input. */
const NARROW = 100;
const WIDE = 160;
const LABEL_W = 140;

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
  /** Fields in tables only turn red; their messages are listed under the table. */
  const tableFeedback = (path: string) => ({ ...feedback(path), inlineMessages: false });
  const messagesUnder = (...prefixes: string[]) => (
    <FieldMessages
      items={issues
        .filter((i) => i.level !== 'info' && prefixes.some((p) => i.path?.startsWith(p)))
        .map((i) => ({ level: i.level, text: issueMessage(i, lang, t) }))}
    />
  );

  // Field factories ---------------------------------------------------------------
  const percentField = (path: string, label: string, bp: number, set: (v: number) => void, hint?: string) => (
    <DecimalField
      {...feedback(path)}
      w={WIDE}
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
      w={WIDE}
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
        {...tableFeedback(path)}
        w={NARROW}
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
        {...tableFeedback(path)}
        w={NARROW}
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

  /**
   * Editable list of named discounts (customer types, month types): names in both
   * languages, discount, reorder, add, remove.
   */
  const labelledList = (kind: 'customers' | 'months', title: string, hint: string, addLabel: string, newLabelKey: string) => {
    const items: LabelledItem[] = config[kind];
    const itemsOf = (c: Config): LabelledItem[] => c[kind];
    const remove = (c: Config, i: number) => {
      const [removed] = itemsOf(c).splice(i, 1);
      // Calendar months that used a removed month type move to the first remaining one.
      if (kind === 'months' && removed) {
        c.calendar = c.calendar.map((m) => (m === removed.id ? (c.months[0]?.id ?? SALE) : m));
      }
    };
    return (
      <Stack gap="xs" w="fit-content" data-testid={`list-${kind}`}>
        <Title order={5}>{title}</Title>
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
        <Table verticalSpacing={4} style={{ width: 'auto' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('settings.labelPl')}</Table.Th>
              <Table.Th>{t('settings.labelEn')}</Table.Th>
              <Table.Th>{multiplierMode ? t('settings.multiplier') : t('settings.discount')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item, i) => {
              const labelError = messageFor(`${kind}.${i}.label`, 'error');
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <TextInput
                      id={fieldId(`${kind}.${i}.label`)}
                      w={LABEL_W}
                      aria-label={t('settings.labelPl')}
                      value={item.label.pl}
                      error={!!labelError}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        update((c) => (itemsOf(c)[i]!.label.pl = v));
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      w={LABEL_W}
                      aria-label={t('settings.labelEn')}
                      value={item.label.en}
                      error={!!labelError}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        update((c) => (itemsOf(c)[i]!.label.en = v));
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    {discountField(`${kind}.${i}.discountBp`, item.discountBp, (v) =>
                      update((c) => (itemsOf(c)[i]!.discountBp = v)))}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label={t('settings.moveUp')}>
                        <ActionIcon
                          variant="subtle"
                          disabled={i === 0}
                          aria-label={t('settings.moveUp')}
                          onClick={() => update((c) => swap(itemsOf(c), i, i - 1))}
                        >
                          ↑
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t('settings.moveDown')}>
                        <ActionIcon
                          variant="subtle"
                          disabled={i === items.length - 1}
                          aria-label={t('settings.moveDown')}
                          onClick={() => update((c) => swap(itemsOf(c), i, i + 1))}
                        >
                          ↓
                        </ActionIcon>
                      </Tooltip>
                      <RemoveButton label={t('settings.remove')} onClick={() => update((c) => remove(c, i))} />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {messagesUnder(kind)}
        <Button
          id={fieldId(kind)}
          variant="light"
          size="xs"
          onClick={() =>
            update((c) => {
              const last = itemsOf(c)[itemsOf(c).length - 1];
              itemsOf(c).push({
                id: `${kind[0]}${Date.now().toString(36)}`,
                label: { pl: t(newLabelKey, { lng: 'pl' }), en: t(newLabelKey, { lng: 'en' }) },
                discountBp: last?.discountBp ?? 0,
              });
            })
          }
        >
          + {addLabel}
        </Button>
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      <Paper p="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Title order={4} className="section-title">
              {t('settings.file')}
            </Title>
            {dirty && (
              <Badge color="orange" variant="light" data-testid="unsaved-badge">
                {t('settings.unsaved')}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            <Button variant="default" onClick={load} data-testid="config-load" radius="xl">
              {t('settings.load')}
            </Button>
            <Button onClick={save} data-testid="config-save" radius="xl">
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
        <Group gap="md" align="flex-start">
          {percentField('handling.percentBp', t('settings.handlingPercent'), config.handling.percentBp, (v) =>
            update((c) => (c.handling.percentBp = v)), t('settings.handlingPercentHint'))}
          {moneyField('handling.fixedGr', t('settings.handlingFixed'), config.handling.fixedGr, (v) =>
            update((c) => (c.handling.fixedGr = v)), t('settings.handlingFixedHint'))}
          {percentField('vatBp', t('settings.vat'), config.vatBp, (v) => update((c) => (c.vatBp = v)))}
          {percentField('fees.percentBp', t('settings.fees'), config.fees.percentBp, (v) =>
            update((c) => (c.fees.percentBp = v)), t('settings.feesHint'))}
          {percentField('minProfit.percentBp', t('settings.minProfitPercent'), config.minProfit.percentBp, (v) =>
            update((c) => (c.minProfit.percentBp = v)), t('settings.minProfitPercentHint'))}
          {moneyField('minProfit.fixedGr', t('settings.minProfitFixed'), config.minProfit.fixedGr, (v) =>
            update((c) => (c.minProfit.fixedGr = v)), t('settings.minProfitFixedHint'))}
        </Group>
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

        <Group gap={40} align="flex-start">
          <Stack gap="xs">
            <Title order={5}>{t('settings.packages')}</Title>
            <Table verticalSpacing={4} style={{ width: 'auto' }}>
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
                        {...tableFeedback(`packages.${i}.qty`)}
                        w={NARROW}
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
            {messagesUnder('packages.')}
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

          <Stack gap="xs" w={WIDE + 40}>
            <Title order={5}>{t('settings.sale')}</Title>
            <DecimalField
              w={WIDE + 40}
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
        </Group>

        {labelledList(
          'customers',
          t('settings.customers'),
          t('settings.customersHint'),
          t('settings.addCustomer'),
          'settings.newCustomer',
        )}
        {labelledList(
          'months',
          t('settings.months'),
          t('settings.monthsHint'),
          t('settings.addMonth'),
          'settings.newMonth',
        )}
      </Section>

      <Accordion
        variant="separated"
        radius="lg"
        styles={{
          item: {
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-default-border)',
            boxShadow: 'var(--mantine-shadow-xs)',
          },
        }}
      >
        <Accordion.Item value="calendar">
          <Accordion.Control>{t('settings.calendar')}</Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" mb="sm">
              {t('settings.calendarHint')}
            </Text>
            <Group gap="sm">
              {config.calendar.map((m, i) => (
                <Select
                  key={i}
                  w={130}
                  size="xs"
                  label={(t('months.names', { returnObjects: true }) as string[])[i]}
                  value={m}
                  allowDeselect={false}
                  onChange={(v) => v && update((c) => (c.calendar[i] = v))}
                  data={monthIds(config).map((mt) => ({ value: mt, label: monthLabel(config, mt, lang, t) }))}
                />
              ))}
            </Group>
            {messagesUnder('calendar')}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Paper p="lg">
      <Stack gap="md">
        <div>
          <Title order={4} className="section-title">
            {title}
          </Title>
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

function FieldMessages({ items }: { items: { level: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Stack gap={2}>
      {items.map((m, i) => (
        <Text key={i} size="xs" c={m.level === 'error' ? 'red' : 'orange.7'}>
          {m.text}
        </Text>
      ))}
    </Stack>
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
