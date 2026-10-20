import '@mantine/core/styles.css';
import { MantineProvider, Select, TextInput, createTheme } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from './i18n';
import { App } from './ui/App';
import { initialState } from './ui/state';

initI18n(initialState().lang);

// Hints and errors go under the input, so inputs in one row stay aligned
// whether or not they have a hint.
const inputWrapperOrder: ('label' | 'input' | 'description' | 'error')[] = ['label', 'input', 'description', 'error'];

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
  components: {
    TextInput: TextInput.extend({ defaultProps: { inputWrapperOrder } }),
    Select: Select.extend({ defaultProps: { inputWrapperOrder } }),
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
);
