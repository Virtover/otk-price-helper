/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed port and must not clear its own console output.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // Pre-bundle at startup so the first page load never triggers a dependency re-optimisation reload.
  optimizeDeps: { include: ['@mantine/core', '@mantine/hooks', 'i18next', 'react-i18next', 'zod', 'exceljs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/config/**'],
      thresholds: { 'src/core/**': { lines: 95 } },
    },
  },
});
