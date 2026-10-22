import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateCustomFields } from '../../src/fields/custom-fields-check';
import { definitionOf } from '../../src/fields/custom-fields-definitions';
import { validateWindows } from '../../src/fields/time-windows-format';
import { isTimezone } from '../../src/fields/timezone-zones';
import { PLACES_BINDING, facilityOccupancyOutput } from '../../src/modules/places/occupancy';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';
import { CUSTOM_ATTRIBUTE_RESOURCE, FACILITY_RESOURCE } from '../../src/data/resource-names';
import { offsetPage, type TestQueryInput } from '../support/pagination';

/**
 * Facilities of Nova Tower through the console's provider, as `org_admin`: seeded
 * facilities pass the console's zone and window checks, a facility is created, updated
 * and deleted, its occupancy now is read, and the server's custom field check
 * (`itap.validate_custom_fields`) refuses and accepts what the console's mirror does
 * for a required facility attribute created for the test. Everything created is deleted.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'facilities-dev-test',
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

const HOURS = [
  { days: [1, 2, 3, 4, 5], from: '07:00', to: '21:00' },
  { days: [6], from: '22:00', to: '06:00' },
];

describe.skipIf(!DEV_STACK_ENABLED)('facilities against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  const facilities: string[] = [];
  const definitions: string[] = [];
  const stamp = Date.now();

  const mutate = (resource: string, input: Record<string, unknown>) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        idField: 'id',
        ...input,
      } as never) as never,
      context(),
    ) as Promise<{ record: Record<string, unknown> }>;

  const query = (resource: string, input: TestQueryInput) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        ...input,
      } as never) as never,
      context(),
    ) as Promise<{ data: unknown }>;

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  afterAll(async () => {
    for (const id of facilities) await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id });
    for (const id of definitions) await mutate(CUSTOM_ATTRIBUTE_RESOURCE, { kind: 'deleteOne', id });
  });

  it('should accept every seeded facility', async () => {
    const { data } = await query(FACILITY_RESOURCE, {
      kind: 'list',
      pagination: offsetPage(1, 200),
    });
    const rows = data as readonly Record<string, unknown>[];
    expect(rows.some((row) => row.name === 'Nova Tower')).toBe(true);
    for (const row of rows) {
      expect(isTimezone(row.timezone), String(row.timezone)).toBe(true);
      expect(validateWindows(row.operating_hours), String(row.name)).toBeNull();
      expect(typeof row.areas_count).toBe('number');
      expect(typeof row.current_occupancy).toBe('number');
    }
  });

  it('should read the occupancy now of the seeded facility', async () => {
    const { data } = await query(FACILITY_RESOURCE, {
      kind: 'list',
      pagination: offsetPage(1, 200),
    });
    const nova = (data as readonly Record<string, unknown>[]).find((row) => row.name === 'Nova Tower');
    const descriptor = createQueryDescriptor({
      ...IDENTITY,
      kind: 'custom',
      ref: { namespace: 'itap', id: 'facility-occupancy-now' },
      resource: PLACES_BINDING,
      operation: 'facilityOccupancyNow',
      input: { facilityId: nova?.id },
    } as never);
    const occupancy = facilityOccupancyOutput.parse(
      await provider.queries?.custom?.(descriptor as never, context()),
    );
    expect(occupancy).not.toBeNull();
    expect(occupancy?.occupancy).toBeGreaterThanOrEqual(0);
  });

  it('should create, update and delete a facility', async () => {
    const created = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: {
        name: `dev-test facility ${stamp}`,
        timezone: 'Europe/Moscow',
        operating_hours: [],
        contact: { phone: '+7 495 000-00-00' },
        custom_fields: {},
        status: 'active',
      },
    });
    const id = String(created.record.id);
    facilities.push(id);
    expect(created.record.code).toMatch(/^FACILITY-\d{5}$/);
    expect(created.record.areas_count).toBe(0);

    await mutate(FACILITY_RESOURCE, {
      kind: 'updateOne',
      id,
      input: { operating_hours: HOURS, latitude: 55.75, longitude: 37.62, status: 'maintenance' },
    });
    const { data } = await query(FACILITY_RESOURCE, { kind: 'one', id });
    expect(data).toMatchObject({ operating_hours: HOURS, latitude: 55.75, status: 'maintenance' });

    await expect(
      mutate(FACILITY_RESOURCE, { kind: 'updateOne', id, input: { latitude: 91 } }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Check constraint violation') });

    await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id });
    facilities.splice(facilities.indexOf(id), 1);
    await expect(query(FACILITY_RESOURCE, { kind: 'one', id })).rejects.toBeDefined();
  });

  it('should refuse and accept custom fields as the console mirror does', async () => {
    const key = `dev_test_${stamp}`;
    const definition = await mutate(CUSTOM_ATTRIBUTE_RESOURCE, {
      kind: 'createOne',
      input: { entity: 'facility', key, label: 'Dev test permit', data_type: 'string', required: true },
    });
    definitions.push(String(definition.record.id));
    const { data } = await query(CUSTOM_ATTRIBUTE_RESOURCE, {
      kind: 'list',
      pagination: offsetPage(1, 500),
      filter: { field: 'entity', op: 'eq', value: 'facility' },
    });
    const defs = (data as readonly Record<string, unknown>[]).map(definitionOf);

    const base = { name: `dev-test cf ${stamp}`, timezone: 'UTC' };
    const refused: readonly Record<string, unknown>[] = [
      {},
      { [key]: null },
      { [key]: 7 },
      { [key]: 'ok', unknown_key: 1 },
    ];
    for (const customFieldsValue of refused) {
      expect(validateCustomFields(customFieldsValue, defs), JSON.stringify(customFieldsValue)).not.toBeNull();
      await expect(
        mutate(FACILITY_RESOURCE, {
          kind: 'createOne',
          input: { ...base, custom_fields: customFieldsValue },
        }),
        JSON.stringify(customFieldsValue),
      ).rejects.toBeDefined();
    }

    const value = { [key]: 'FP-1' };
    expect(validateCustomFields(value, defs)).toBeNull();
    const created = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { ...base, custom_fields: value },
    });
    facilities.push(String(created.record.id));
    expect(created.record.custom_fields).toEqual(value);
  });
});
