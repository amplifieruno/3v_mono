import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

function readEnv(path: string): Record<string, string> {
  return existsSync(path) ? dotenv.parse(readFileSync(path)) : {};
}

// Root .env.dev (docker stack) first, backend .env overrides; real process env wins over both.
const fileEnv = { ...readEnv(resolve(here, '../../.env.dev')), ...readEnv(resolve(here, '.env')) };
const env: Record<string, string> = { ...fileEnv };
for (const [key, value] of Object.entries(process.env)) {
  if (key in fileEnv && value !== undefined) env[key] = value;
}

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/support/setup.ts'],
    // One file at a time, and no `it.concurrent` inside a file (maxConcurrency 1): the suite shares one dev stack.
    // Connection budget: Hasura's source pool is HASURA_GRAPHQL_PG_CONNECTIONS = 50 (+ its metadata/event
    // connections), hasura-auth and hasura-storage keep small pools, Postgres max_connections is 100. A full run peaks
    // around 30 client connections (final-fix report), so tests that burst requests with Promise.all are capped by
    // Hasura's pool, not by Postgres.
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 30000,
    env,
  },
});
