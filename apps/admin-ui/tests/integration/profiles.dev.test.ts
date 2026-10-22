import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { PROFILE_RESOURCE } from '../../src/data/resource-names';
import { PEOPLE_BINDING, profileActivityOutput } from '../../src/modules/people/profile-activity';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Profiles against the dev stack (Nova, `org_admin`, seeded people). Profiles cannot be deleted,
 * so nothing is created: the saved views' filters on the computed fields are read, a seeded
 * employee is edited and restored, the database refuses an end date before the start date and a
 * restriction column, and the activity facts are read for a person with stats.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'profiles-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const ref = (id: string) => ({ namespace: 'default', id });

type Row = Record<string, unknown>;

describe.skipIf(!DEV_STACK_ENABLED)('profiles against the dev stack', () => {
  let provider: DataProvider;
  let employee: Row | undefined;

  const update = (id: string, input: Row) =>
    provider.mutations?.updateOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'updateOne',
        ref: ref(PROFILE_RESOURCE),
        resource: PROFILE_RESOURCE,
        idField: 'id',
        id,
        input,
      } as never) as never,
      context(),
    ) as Promise<{ record: Row }>;

  const list = async (filter: Row | null) => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(PROFILE_RESOURCE),
        resource: PROFILE_RESOURCE,
        pagination: { kind: 'offset', page: 1, pageSize: 100 },
        ...(filter === null ? {} : { filter }),
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const employees = await list({
      and: [
        { field: 'profile_type', op: 'eq', value: 'employee' },
        { field: 'processing_restricted', op: 'eq', value: false },
        { field: 'erased_at', op: 'isNull' },
      ],
    });
    employee = employees.find((row) => row.start_date !== null && row.has_face === true);
  });

  afterAll(async () => {
    if (employee !== undefined) {
      await update(String(employee.id), { notes: employee.notes ?? null, end_date: employee.end_date ?? null });
    }
  });

  it('should filter on the computed badges the saved views use', async () => {
    const blacklisted = await list({ field: 'is_blacklisted', op: 'eq', value: true });
    expect(blacklisted.length).toBeGreaterThan(0);
    expect(blacklisted.every((row) => row.is_blacklisted === true)).toBe(true);
    const pending = await list({ field: 'has_face', op: 'eq', value: false });
    expect(pending.every((row) => row.has_face === false && row.identities_count === 0)).toBe(true);
  });

  it('should edit a seeded employee and read the change back', async () => {
    expect(employee, 'a seeded employee with a face').toBeDefined();
    const id = String(employee?.id);
    const { record } = await update(id, { notes: 'dev-test note' });
    expect(record).toMatchObject({ id, notes: 'dev-test note', profile_type: 'employee' });
    expect(record.code).toMatch(/^PROFILE-\d{5}$/);
  });

  it('should refuse an end date before the start date and a restriction column', async () => {
    const id = String(employee?.id);
    await expect(update(id, { end_date: '2000-01-01' })).rejects.toMatchObject({
      message: expect.stringMatching(/profiles_dates_ordered|[Cc]heck constraint/),
    });
    await expect(update(id, { processing_restricted: true })).rejects.toBeDefined();
  });

  it('should read the activity facts of a person with stats', async () => {
    const descriptor = (profileId: string) =>
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'custom',
        ref: ref('profile-activity'),
        resource: PEOPLE_BINDING,
        operation: 'profileActivity',
        input: { profileId },
      } as never);
    const faces = await list({ field: 'has_face', op: 'eq', value: true });
    let found = false;
    for (const row of faces.slice(0, 20)) {
      const activity = await provider.queries?.custom?.(descriptor(String(row.id)) as never, context());
      if (activity === null || activity === undefined) continue;
      const parsed = profileActivityOutput.parse(activity);
      expect(parsed.visits_last_30d).toBeGreaterThanOrEqual(0);
      found = true;
      break;
    }
    expect(found, 'a seeded person with activity stats').toBe(true);
  });
});
