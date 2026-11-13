import {
  ActionIcon,
  Container,
  Group,
  Image,
  SegmentedControl,
  Tabs,
  Text,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalculatorTab } from './CalculatorTab';
import { REVEAL_AMOUNTS } from './components/AmountMatrix';
import { SettingsTab } from './SettingsTab';
import { fieldId } from './format';
import { isDirty, useAppState } from './state';
import { UpdateBanner, VersionButton, useUpdater } from './updater';

type Tab = 'calculator' | 'settings';

export function App() {
  const { t, i18n } = useTranslation();
  const [state, dispatch, history] = useAppState();
  const updater = useUpdater();
  const [tab, setTab] = useState<Tab>('calculator');
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const themeLabel = scheme === 'dark' ? t('app.themeLight') : t('app.themeDark');

  useEffect(() => {
    void i18n.changeLanguage(state.lang);
    document.documentElement.lang = state.lang;
  }, [state.lang, i18n]);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z): undo / redo price and settings changes.
  // Text fields keep their own undo of the typed text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.undo, history.redo]);

  /** Switches to the tab holding the field and focuses it. */
  const goTo = (path: string) => {
    const amount = path.startsWith('amounts.');
    setTab(path.startsWith('input.') || amount ? 'calculator' : 'settings');
    if (amount) window.dispatchEvent(new Event(REVEAL_AMOUNTS));
    setTimeout(() => {
      const el = document.getElementById(fieldId(path));
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    }, 50);
  };

  return (
    <>
      <header className="app-header">
        <Container size="lg" py="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Image src="/favicon.svg" alt="" w={40} h={40} radius="md" />
              <div>
                <Title order={3} className="brand-title" lh={1.1}>
                  {t('app.title')}
                </Title>
                <Text size="xs" c="dimmed">
                  {t('app.tagline')}
                </Text>
              </div>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <VersionButton updater={updater} />
              <Tooltip label={t('app.undo')}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  radius="xl"
                  aria-label={t('app.undo')}
                  disabled={!history.canUndo}
                  onClick={history.undo}
                  data-testid="undo"
                >
                  ↶
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('app.redo')}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  radius="xl"
                  aria-label={t('app.redo')}
                  disabled={!history.canRedo}
                  onClick={history.redo}
                  data-testid="redo"
                >
                  ↷
                </ActionIcon>
              </Tooltip>
              <Tooltip label={themeLabel}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  radius="xl"
                  aria-label={themeLabel}
                  data-testid="theme-toggle"
                  onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                >
                  {scheme === 'dark' ? '☀' : '☾'}
                </ActionIcon>
              </Tooltip>
              <SegmentedControl
                radius="xl"
                size="xs"
                aria-label={t('app.language')}
                value={state.lang}
                onChange={(v) => dispatch({ type: 'setLang', lang: v === 'en' ? 'en' : 'pl' })}
                data={[
                  { value: 'pl', label: 'PL' },
                  { value: 'en', label: 'EN' },
                ]}
                data-testid="lang-switch"
              />
            </Group>
          </Group>
        </Container>
      </header>
      <Container size="lg" py="md">
        <UpdateBanner updater={updater} />
        <Tabs
          variant="pills"
          radius="xl"
          value={tab}
          onChange={(v) => setTab(v === 'settings' ? 'settings' : 'calculator')}
          keepMounted={false}
        >
          <Tabs.List mb="lg">
            <Tabs.Tab value="calculator">{t('app.tabs.calculator')}</Tabs.Tab>
            <Tabs.Tab value="settings">
              {t('app.tabs.settings')}
              {isDirty(state) ? ' •' : ''}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="calculator">
            <CalculatorTab state={state} dispatch={dispatch} onGoTo={goTo} />
          </Tabs.Panel>
          <Tabs.Panel value="settings">
            <SettingsTab state={state} dispatch={dispatch} />
          </Tabs.Panel>
        </Tabs>
      </Container>
    </>
  );
}
