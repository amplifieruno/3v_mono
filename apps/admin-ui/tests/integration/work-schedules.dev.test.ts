import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateWindows } from '../../src/fields/time-windows-format';
import { isTimezone } from '../../src/fields/timezone-zones';
import { WORK_SCHEDULE_RESOURCE } from '../../src/modules/organization/work-schedules';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';

/**
 * Work schedules of Nova Tower through the console's provider, as `org_admin`: every
 * seeded schedule passes the console's window and time zone checks, an overnight and a
 * whole-day window round-trip unchanged, and the server refuses (`itap.valid_windows`,
 * `itap.is_valid_timezone`) what the form refuses. The created schedule is deleted again.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'work-schedules-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

const ref = { namespace: 'default', id: WORK_SCHEDULE_RESOURCE };

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const WINDOWS = [
  { days: [5, 6], from: '22:00', to: '06:00' },
  { days: [7], from: '00:00', to: '24:00' },
];

describe.skipIf(!DEV_STACK_ENABLED)('work schedules against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  const created: string[] = [];

  const mutate = (input: Record<string, unknown>) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({
        ...IDENTITY,
        ref,
        resource: WORK_SCHEDULE_RESOURCE,
        idField: 'id',
        ...input,
      } as never) as never,
      context(),
    );

  const query = (input: Record<string, unknown>) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({
        ...IDENTITY,
        ref,
        resource: WORK_SCHEDULE_RESOURCE,
        ...input,
      } as never) as never,
      context(),
    );

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  afterAll(async () => {
    for (const id of created) await mutate({ kind: 'deleteOne', id });
  });

  it('should accept every seeded schedule', async () => {
    const { data } = (await query({ kind: 'list', pagination: { page: 1, pageSize: 100 } })) as {
      data: readonly Record<string, unknown>[];
    };
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(validateWindows(row.windows), String(row.name)).toBeNull();
      expect(isTimezone(row.timezone), String(row.timezone)).toBe(true);
    }
  });

  it('should keep an overnight and a whole-day window unchanged', async () => {
    const result = (await mutate({
      kind: 'createOne',
      input: { name: `dev-test ${Date.now()}`, timezone: 'Europe/Moscow', windows: WINDOWS },
    })) as { record: Record<string, unknown> };
    const id = String(result.record.id);
    created.push(id);
    expect(validateWindows(WINDOWS)).toBeNull();
    const { data } = (await query({ kind: 'one', id })) as { data: Record<string, unknown> };
    expect(data.windows).toEqual(WINDOWS);
  });

  it('should be refused by the server where the form refuses a malformed window or zone', async () => {
    const refused: readonly Record<string, unknown>[] = [
      { windows: [{ days: [], from: '08:00', to: '18:00' }] },
      { windows: [{ days: [1], from: '8:00', to: '18:00' }] },
      { windows: [{ days: [8], from: '08:00', to: '18:00' }] },
      { timezone: 'Mars/Olympus' },
    ];
    for (const input of refused) {
      if ('windows' in input) expect(validateWindows(input.windows)).not.toBeNull();
      else expect(isTimezone(input.timezone)).toBe(false);
      await expect(
        mutate({
          kind: 'createOne',
          input: { name: 'dev-test refused', timezone: 'UTC', windows: [], ...input },
        }),
        JSON.stringify(input),
      ).rejects.toMatchObject({ message: expect.stringContaining('Check constraint violation') });
    }
  });
});
