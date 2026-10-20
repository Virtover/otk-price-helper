import { type MantineColorsTuple, Paper, Select, TextInput, createTheme } from '@mantine/core';

/** Warm gold taken from the app icon. */
const brand: MantineColorsTuple = [
  '#fdf8ef',
  '#f6ecd9',
  '#ecd6ad',
  '#e2bf7e',
  '#daac57',
  '#d5a03e',
  '#d39a30',
  '#bb8523',
  '#a7751c',
  '#916410',
];

/** Warm charcoal, matching the icon background, used for dark mode surfaces. */
const dark: MantineColorsTuple = [
  '#e6e0da',
  '#c4bcb4',
  '#9c938b',
  '#766e67',
  '#4f4842',
  '#3a3430',
  '#2b2622',
  '#201c19',
  '#181513',
  '#110f0e',
];

// Hints and errors go under the input, so inputs in one row stay aligned
// whether or not they have a hint.
const inputWrapperOrder: ('label' | 'input' | 'description' | 'error')[] = ['label', 'input', 'description', 'error'];

export const theme = createTheme({
  colors: { brand, dark },
  primaryColor: 'brand',
  primaryShade: { light: 7, dark: 5 },
  autoContrast: true,
  defaultRadius: 'md',
  fontFamily: "'Inter Variable', 'Segoe UI', system-ui, sans-serif",
  headings: { fontFamily: "'Inter Variable', 'Segoe UI', system-ui, sans-serif", fontWeight: '700' },
  shadows: {
    xs: '0 1px 2px rgba(40, 28, 10, 0.05), 0 1px 3px rgba(40, 28, 10, 0.06)',
    sm: '0 2px 6px rgba(40, 28, 10, 0.06), 0 8px 24px rgba(40, 28, 10, 0.06)',
  },
  components: {
    TextInput: TextInput.extend({ defaultProps: { inputWrapperOrder } }),
    Select: Select.extend({ defaultProps: { inputWrapperOrder } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg', shadow: 'xs', withBorder: true } }),
  },
});
