import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Тесты страниц по умолчанию идут на fixtures; live-дефолт проверяется отдельно.
beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv('VITE_DATA_MODE', 'fixtures');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
