import { ActionIcon, Anchor, Button, Group, Paper, Progress, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauri } from '../lib/fileio';

/**
 * In-app updates (desktop only). On start, and when the version label in the header is clicked, the app
 * asks GitHub for latest.json; a newer signed version is offered in a banner, downloaded with progress,
 * installed (passive installer window) and the app restarts. Nothing happens in the browser build.
 */

type Update = import('@tauri-apps/plugin-updater').Update;

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; done: number; total?: number }
  | { kind: 'installing'; update: Update }
  | { kind: 'error'; message: string; update?: Update };

const RELEASES_URL = 'https://github.com/Virtover/otk-price-helper/releases';

/** Opens a page of this repository in the default browser (the app window never navigates away). */
function openPage(url: string) {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url)).catch((e) => console.warn(e));
}
/** First automatic check: shortly after start, so it never slows the app down. */
const STARTUP_DELAY_MS = 3000;

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const [version, setVersion] = useState<string>();
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async (manual: boolean) => {
    if (!isTauri() || busy.current) return;
    busy.current = true;
    if (manual) setState({ kind: 'checking' });
    try {
      const { check: checkUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkUpdate();
      if (update) {
        setDismissed(false);
        setState({ kind: 'available', update });
      } else if (manual) {
        setState({ kind: 'upToDate' });
      }
    } catch (e) {
      // The automatic check stays silent (offline, GitHub down); only a manual one reports it.
      if (manual) setState({ kind: 'error', message: String(e) });
      else console.warn('update check failed', e);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void import('@tauri-apps/api/app').then(({ getVersion }) => getVersion().then(setVersion));
    const timer = setTimeout(() => void check(false), STARTUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [check]);

  // "Up to date" is a short confirmation of a manual check.
  useEffect(() => {
    if (state.kind !== 'upToDate') return;
    const timer = setTimeout(() => setState({ kind: 'idle' }), 4000);
    return () => clearTimeout(timer);
  }, [state.kind]);

  const install = useCallback(async (update: Update) => {
    let done = 0;
    let total: number | undefined;
    setState({ kind: 'downloading', update, done });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength;
        else if (event.event === 'Progress') done += event.data.chunkLength;
        else if (event.event === 'Finished') {
          setState({ kind: 'installing', update });
          return;
        }
        setState({ kind: 'downloading', update, done, total });
      });
      // On Windows the installer usually closes the app itself; restart in case it did not.
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setState({ kind: 'error', message: String(e), update });
    }
  }, []);

  return {
    state,
    version,
    visible: !dismissed && state.kind !== 'idle' && state.kind !== 'checking',
    check: () => void check(true),
    install: (update: Update) => void install(update),
    dismiss: () => {
      setDismissed(true);
      if (state.kind === 'upToDate' || state.kind === 'error') setState({ kind: 'idle' });
    },
  };
}

type Updater = ReturnType<typeof useUpdater>;

/** Version label in the header; a click checks for updates. Desktop only. */
export function VersionButton({ updater }: { updater: Updater }) {
  const { t } = useTranslation();
  if (!updater.version) return null;
  const checking = updater.state.kind === 'checking';
  return (
    <Tooltip label={t('update.check')}>
      <UnstyledButton onClick={updater.check} disabled={checking} className="version-button" data-testid="version-button">
        <Text size="xs" c="dimmed" className="num">
          {checking ? t('update.checking') : `v${updater.version}`}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}

/** Banner under the header: new version offer, download progress, installing, up to date or an error. */
export function UpdateBanner({ updater }: { updater: Updater }) {
  const { t } = useTranslation();
  const { state } = updater;
  if (!updater.visible) return null;

  const releaseLink = (version: string) => (
    <Anchor component="button" type="button" size="sm" onClick={() => openPage(`${RELEASES_URL}/tag/v${version}`)}>
      {t('update.whatsNew')}
    </Anchor>
  );
  const close = (
    <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={t('common.close')} onClick={updater.dismiss}>
      ×
    </ActionIcon>
  );

  let body: React.ReactNode;
  let tone = 'update-banner';
  switch (state.kind) {
    case 'available':
      body = (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">
            <b>{t('update.available', { version: state.update.version })}</b>{' '}
            <Text span size="sm" c="dimmed">
              {t('update.current', { version: state.update.currentVersion })}
            </Text>
          </Text>
          <Group gap="xs" wrap="nowrap">
            {releaseLink(state.update.version)}
            <Button size="xs" radius="xl" onClick={() => updater.install(state.update)} data-testid="update-install">
              {t('update.install')}
            </Button>
            <Button size="xs" radius="xl" variant="default" onClick={updater.dismiss}>
              {t('update.later')}
            </Button>
          </Group>
        </Group>
      );
      break;
    case 'downloading': {
      const pct = state.total ? Math.min(100, Math.round((state.done / state.total) * 100)) : undefined;
      body = (
        <Group wrap="nowrap" gap="md">
          <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
            {t('update.downloading', { version: state.update.version })}
            {pct !== undefined ? ` ${pct} %` : ''}
          </Text>
          <Progress value={pct ?? 100} animated={pct === undefined} striped={pct === undefined} style={{ flex: 1 }} />
        </Group>
      );
      break;
    }
    case 'installing':
      body = <Text size="sm">{t('update.installing', { version: state.update.version })}</Text>;
      break;
    case 'upToDate':
      body = (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">{t('update.upToDate', { version: updater.version })}</Text>
          {close}
        </Group>
      );
      break;
    case 'error':
      tone = 'update-banner update-banner-error';
      body = (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">
            {t(state.update ? 'update.installFailed' : 'update.checkFailed')}{' '}
            <Text span size="xs" c="dimmed">
              {state.message}
            </Text>
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Anchor component="button" type="button" size="sm" onClick={() => openPage(RELEASES_URL)}>
              {t('update.manual')}
            </Anchor>
            {close}
          </Group>
        </Group>
      );
      break;
    default:
      return null;
  }
  return (
    <Paper px="md" py="xs" mb="md" className={tone} data-testid="update-banner" role="status">
      {body}
    </Paper>
  );
}
