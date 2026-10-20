import {
  ActionIcon,
  Container,
  Group,
  SegmentedControl,
  Tabs,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, isTauri } from '../lib/fileio';
import { CalculatorTab } from './CalculatorTab';
import { SettingsTab } from './SettingsTab';
import { fieldId } from './format';
import { isDirty, useAppState } from './state';

type Tab = 'calculator' | 'settings';

export function App() {
  const { t, i18n } = useTranslation();
  const [state, dispatch] = useAppState();
  const [tab, setTab] = useState<Tab>('calculator');
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const themeLabel = scheme === 'dark' ? t('app.themeLight') : t('app.themeDark');
  const dirty = isDirty(state);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    void i18n.changeLanguage(state.lang);
    document.documentElement.lang = state.lang;
  }, [state.lang, i18n]);

  // Ask before closing with unsaved settings.
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          if (dirtyRef.current && !(await confirmDialog(t('settings.confirmDiscard'), t('app.title')))) {
            event.preventDefault();
          }
        });
      });
      return () => unlisten?.();
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [t]);

  /** Switches to the tab holding the field and focuses it. */
  const goTo = (path: string) => {
    setTab(path.startsWith('input.') ? 'calculator' : 'settings');
    setTimeout(() => {
      const el = document.getElementById(fieldId(path));
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    }, 50);
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>{t('app.title')}</Title>
        <Group gap="xs">
          <Tooltip label={themeLabel}>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={themeLabel}
              data-testid="theme-toggle"
              onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
            >
              {scheme === 'dark' ? '☀' : '☾'}
            </ActionIcon>
          </Tooltip>
          <SegmentedControl
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
      <Tabs value={tab} onChange={(v) => setTab(v === 'settings' ? 'settings' : 'calculator')} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="calculator">{t('app.tabs.calculator')}</Tabs.Tab>
          <Tabs.Tab value="settings">
            {t('app.tabs.settings')}
            {dirty ? ' •' : ''}
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
  );
}
