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
    // Dev-stack runs sign in once for the whole run (hasura-auth rate-limits sign-ins).
    globalSetup: process.env.ITAP_DEV_STACK === '1' ? ['tests/support/dev-global-setup.ts'] : [],
  },
});
