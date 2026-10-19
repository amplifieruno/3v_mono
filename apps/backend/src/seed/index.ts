import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { createHasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { seedCompanies, type SeedCompaniesResult } from './companies.js';
import { seedDeviceHealth, type SeedDeviceHealthResult } from './deviceHealth.js';
import { seedDevices, type SeedDevicesResult } from './devices.js';
import { seedFacilities, type SeedFacilitiesResult } from './facilities.js';
import { seedFaces, type SeedIdentitiesResult } from './faces.js';
import { seedHistory, type SeedHistoryResult } from './history.js';
import { seedPeople, type SeedPeopleResult } from './people.js';
import { resetTenancy, seedTenancy, type SeedContext, type SeedTenancyResult } from './tenancy.js';

/** Results of the seed steps, keyed by step name. */
export type SeedResults = {
  tenancy: SeedTenancyResult;
  companies: SeedCompaniesResult;
  profiles: SeedPeopleResult;
  identities: SeedIdentitiesResult;
  facilities: SeedFacilitiesResult;
  devices: SeedDevicesResult;
  deviceHealth: SeedDeviceHealthResult;
  history: SeedHistoryResult;
};

type StepName = keyof SeedResults;

/** A step with the earlier results it declares it needs; runSeed checks they exist before calling it. */
type SeedStep<R> = { requires: readonly StepName[]; run(ctx: SeedContext, previous: Partial<SeedResults>): Promise<R> };

function step<D extends StepName, R>(
  requires: readonly D[],
  run: (ctx: SeedContext, previous: Pick<SeedResults, D>) => Promise<R>,
): SeedStep<R> {
  return {
    requires,
    run(ctx, previous) {
      const missing = requires.filter((name) => previous[name] === undefined);
      if (missing.length > 0) throw new Error(`seed step needs ${missing.join(', ')} first`);
      // Every required key was checked above.
      return run(ctx, previous as Pick<SeedResults, D>);
    },
  };
}

/**
 * Ordered seed steps (object order = run order). Later slices append `seed<Area>` steps here, add the result type
 * to SeedResults and list the earlier results the step needs in `requires`.
 */
const steps: { [K in StepName]: SeedStep<SeedResults[K]> } = {
  tenancy: step([], (ctx) => seedTenancy(ctx)),
  companies: step(['tenancy'], (ctx, { tenancy }) => seedCompanies(ctx, tenancy)),
  profiles: step(['tenancy', 'companies'], (ctx, { tenancy, companies }) => seedPeople(ctx, tenancy, companies)),
  identities: step(['tenancy', 'profiles'], (ctx, { tenancy, profiles }) => seedFaces(ctx, tenancy, profiles)),
  facilities: step(['tenancy'], (ctx, { tenancy }) => seedFacilities(ctx, tenancy)),
  // After identities: the seeded faces' camera photos are re-pointed to the camera that captured them.
  devices: step(['tenancy', 'facilities', 'profiles', 'identities'], (ctx, { tenancy, facilities, profiles }) =>
    seedDevices(ctx, tenancy, facilities, profiles),
  ),
  deviceHealth: step(['tenancy', 'devices'], (ctx, { tenancy, devices }) => seedDeviceHealth(ctx, tenancy, devices)),
  history: step(['tenancy', 'facilities', 'devices', 'profiles', 'identities'], (ctx, r) =>
    seedHistory(ctx, r.tenancy, r.facilities, r.devices, r.profiles, r.identities),
  ),
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
  for (const name of Object.keys(steps) as StepName[]) {
    log(`Seeding ${name}...`);
    // Each step's result type is keyed by its name; the cast keeps the loop generic.
    (results as Record<string, unknown>)[name] = await steps[name].run(ctx, results);
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
  const results = await runSeed(ctx, { reset: process.argv.includes('--reset') });
  const history = results.history;
  if (history) {
    const { replay } = history;
    if (replay.skipped === 'needs_reset') {
      log('History: Nova Tower already has tracking data but no seeded history; the history replay needs `pnpm seed --reset`.');
    } else if (replay.skipped === 'seeded') log('History: replay skipped (already seeded).');
    else log(`History: ${replay.days} days, ${replay.detections} detections, ${replay.visits} visits in ${Math.round(replay.durationMs / 1000)} s.`);
    if (history.riverside.skipped === 'needs_reset') log('History: Riverside replay needs `pnpm seed --reset`.');
  }
  log(`Seed complete in ${Math.round((Date.now() - ctx.now.getTime()) / 1000)} s.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
