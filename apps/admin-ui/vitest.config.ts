import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Unit and integration tests under `tests/`; always `vitest run`, never watch. */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
