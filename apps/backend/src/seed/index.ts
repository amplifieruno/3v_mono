import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { createHasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { resetTenancy, seedTenancy, type SeedContext, type SeedTenancyResult } from './tenancy.js';

/** Results of the steps run so far; each later step receives everything produced before it. */
export type SeedResults = { tenancy: SeedTenancyResult };

/**
 * Ordered seed steps. Later slices append `seed<Area>` steps here; add the area's result type to
 * SeedResults and the step receives the earlier results through `previous`.
 */
const steps: { [K in keyof SeedResults]: (ctx: SeedContext, previous: Partial<SeedResults>) => Promise<SeedResults[K]> } = {
  tenancy: (ctx) => seedTenancy(ctx),
};

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

export async function runSeed(ctx: SeedContext, options: { reset: boolean }): Promise<Partial<SeedResults>> {
  if (options.reset) {
    log('Resetting seed data...');
    await resetTenancy(ctx);
  }
  const results: Partial<SeedResults> = {};
  for (const name of Object.keys(steps) as (keyof SeedResults)[]) {
    log(`Seeding ${name}...`);
    // Each step's result type is keyed by its name; the cast keeps the loop generic.
    (results as Record<string, unknown>)[name] = await steps[name](ctx, results);
  }
  return results;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const ctx: SeedContext = {
    env,
    admin: createHasuraClient(env),
    storage: createStorageClient(env),
    now: new Date(),
  };
  await runSeed(ctx, { reset: process.argv.includes('--reset') });
  log('Seed complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
