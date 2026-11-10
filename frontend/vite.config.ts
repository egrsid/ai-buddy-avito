import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {'/api': {target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080'}},
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {lines: 80.01},
    },
  },
});
