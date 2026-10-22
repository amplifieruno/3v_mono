import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateTemplateStructure } from '../../src/fields/template-structure-format';
import { applyFacilityTemplateOutput } from '../../src/modules/places/apply-template';
import { PLACES_BINDING } from '../../src/modules/places/occupancy';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  ACCESS_POINT_RESOURCE,
  AREA_RESOURCE,
  FACILITY_RESOURCE,
  FACILITY_TEMPLATE_RESOURCE,
} from '../../src/data/resource-names';

/**
 * Access points, device bindings and facility templates against the dev stack (Nova Tower,
 * `org_admin`), on a facility and a template created for the test. Applying the template twice
 * reports what the server created both times: `apply_facility_template` never skips an
 * existing name, so the second run doubles the tree (Review Focus 5, the form warns first).
 * A device binding is made on a seeded access point and removed again. Everything created is
 * deleted.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'access-points-dev-test',
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

describe.skipIf(!DEV_STACK_ENABLED)('access points and templates against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const stamp = Date.now();
  let facilityId = '';
  let templateId = '';
  const points: string[] = [];

  const mutate = (resource: string, input: Row) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({ ...IDENTITY, ref: ref(resource), resource, idField: 'id', ...input } as never) as never,
      context(),
    ) as Promise<{ record: Row }>;

  const list = async (resource: string, filter: Row) => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: { kind: 'offset', page: 1, pageSize: 200 },
        filter,
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  const apply = async (parentAreaId: string | null) =>
    applyFacilityTemplateOutput.parse(
      await provider.mutations?.custom?.(
        createMutationDescriptor({
          ...IDENTITY,
          kind: 'custom',
          ref: ref('apply-facility-template'),
          resource: PLACES_BINDING,
          operation: 'applyFacilityTemplate',
          input: { templateId, facilityId, parentAreaId },
        } as never) as never,
        context(),
      ),
    );

  /** A raw read as the signed-in `org_admin` (devices have no console resource yet). */
  const gql = async (query: string): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown };
    expect(body.errors).toBeUndefined();
    return body.data ?? {};
  };

  const structure = [
    { name: 'Elevator Lobby', area_type: 'corridor', capacity: 30 },
    {
      name: 'Open Office',
      area_type: 'zone',
      access_level: 'restricted',
      capacity: 40.0,
      children: [{ name: 'Focus Booths', area_type: 'room', capacity: 8 }],
    },
  ];

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const { record: facility } = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test templates ${stamp}`, timezone: 'UTC' },
    });
    facilityId = String(facility.id);
    expect(validateTemplateStructure(structure)).toBeNull();
    const { record: template } = await mutate(FACILITY_TEMPLATE_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test template ${stamp}`, description: 'Test floor', structure },
    });
    templateId = String(template.id);
  });

  afterAll(async () => {
    for (const id of points) await mutate(ACCESS_POINT_RESOURCE, { kind: 'deleteOne', id });
    if (facilityId) {
      // Deepest first: an area with sub-areas cannot be deleted.
      const areas = await list(AREA_RESOURCE, { field: 'facility_id', op: 'eq', value: facilityId });
      const byDepth = [...areas].sort((a, b) => Number(b.depth) - Number(a.depth));
      for (const area of byDepth) await mutate(AREA_RESOURCE, { kind: 'deleteOne', id: area.id });
      await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id: facilityId });
    }
    if (templateId) await mutate(FACILITY_TEMPLATE_RESOURCE, { kind: 'deleteOne', id: templateId });
  });

  it('refuses a structure the console refuses', async () => {
    const bad = [{ name: 'Hall', area_type: 'hall' }];
    expect(validateTemplateStructure(bad)?.code).toBe('templateStructure.badType');
    await expect(
      mutate(FACILITY_TEMPLATE_RESOURCE, {
        kind: 'updateOne',
        id: templateId,
        input: { structure: bad },
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/structure_valid|[Cc]heck constraint/) });
  });

  // Pins today's doubling; when bd 3v_mono-62p makes apply_facility_template skip names that
  // already exist under the same parent, this test changes to expect the second apply to skip.
  it('reports the created areas on each apply; the second apply doubles the tree', async () => {
    const first = await apply(null);
    expect(first).toEqual({ created: 3, top_level: 2, names: 'Elevator Lobby, Open Office' });
    const second = await apply(null);
    expect(second).toEqual(first);

    const areas = await list(AREA_RESOURCE, { field: 'facility_id', op: 'eq', value: facilityId });
    const named = (name: string) => areas.filter((area) => area.name === name);
    expect(named('Elevator Lobby')).toHaveLength(2);
    expect(named('Focus Booths')).toHaveLength(2);
    expect(named('Open Office').every((area) => area.access_level === 'restricted')).toBe(true);
    expect(named('Open Office').every((area) => area.capacity === 40)).toBe(true);

    // Inside an area: the template's top level lands under it.
    const office = named('Open Office')[0];
    const inside = await apply(String(office?.id));
    expect(inside.created).toBe(3);
    const nested = await list(AREA_RESOURCE, { field: 'parent_id', op: 'eq', value: office?.id });
    expect(nested.map((area) => area.name).sort()).toEqual(['Elevator Lobby', 'Focus Booths', 'Open Office']);
  });

  it('creates an access point at a position and refuses leading from its own area', async () => {
    const areas = await list(AREA_RESOURCE, { field: 'facility_id', op: 'eq', value: facilityId });
    const [lobby, office] = areas;
    const { record } = await mutate(ACCESS_POINT_RESOURCE, {
      kind: 'createOne',
      input: {
        facility_id: facilityId,
        area_id: office?.id,
        from_area_id: lobby?.id,
        name: `Office door ${stamp}`,
        position: [120, 80],
        face_credential: true,
      },
    });
    points.push(String(record.id));
    expect(record).toMatchObject({
      kind: 'door',
      direction: 'both',
      is_entry_exit: false,
      face_credential: true,
      status: 'active',
      position: [120, 80],
    });
    await expect(
      mutate(ACCESS_POINT_RESOURCE, {
        kind: 'updateOne',
        id: record.id,
        input: { from_area_id: office?.id },
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/areas_differ|[Cc]heck constraint/) });
  });

  it('binds a device of the same facility to a seeded access point, once, and unbinds it', async () => {
    const data = await gql(`query {
      access_points(where: { status: { _eq: active } }, order_by: { name: asc }) {
        id facility_id access_point_devices { device_id }
      }
      devices(order_by: { name: asc }) { id facility_id }
    }`);
    const seededPoints = data.access_points as { id: string; facility_id: string; access_point_devices: { device_id: string }[] }[];
    const devices = data.devices as { id: string; facility_id: string }[];
    const pair = seededPoints
      .flatMap((point) =>
        devices
          .filter((device) => device.facility_id === point.facility_id)
          .filter((device) => !point.access_point_devices.some((b) => b.device_id === device.id))
          .map((device) => ({ point, device })),
      )
      .at(0);
    expect(pair, 'a seeded access point with an unbound device of its facility').toBeDefined();
    if (pair === undefined) return;
    const { record } = await mutate(ACCESS_POINT_DEVICE_RESOURCE, {
      kind: 'createOne',
      input: {
        facility_id: pair.point.facility_id,
        access_point_id: pair.point.id,
        device_id: pair.device.id,
        role: 'sensor',
      },
    });
    try {
      const bound = await list(ACCESS_POINT_DEVICE_RESOURCE, {
        field: 'access_point_id',
        op: 'eq',
        value: pair.point.id,
      });
      expect(bound.map((row) => row.device_id)).toContain(pair.device.id);
      await expect(
        mutate(ACCESS_POINT_DEVICE_RESOURCE, {
          kind: 'createOne',
          input: {
            facility_id: pair.point.facility_id,
            access_point_id: pair.point.id,
            device_id: pair.device.id,
            role: 'camera',
          },
        }),
      ).rejects.toBeDefined();
    } finally {
      await mutate(ACCESS_POINT_DEVICE_RESOURCE, { kind: 'deleteOne', id: record.id });
    }
  });
});
