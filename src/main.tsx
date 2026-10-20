import '@fontsource-variable/inter';
import '@mantine/core/styles.css';
import './ui/app.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from './i18n';
import { App } from './ui/App';
import { initialState } from './ui/state';
import { theme } from './ui/theme';

initI18n(initialState().lang);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
);
