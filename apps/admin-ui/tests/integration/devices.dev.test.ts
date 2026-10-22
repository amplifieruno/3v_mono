import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  AREA_RESOURCE,
  DEVICE_AREA_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
} from '../../src/data/resource-names';
import { streamUrlProblem } from '../../src/modules/devices/device-checks';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';

/**
 * Devices against the dev stack (Nova, `org_admin`), on a facility created for the test: a
 * camera is created with a password the role can write but never read back (a select naming
 * `password` is refused), an edit without one leaves it out, the database refuses credentials
 * in the stream URL and a recognition rate past 5, a coverage shape is stored as
 * `itap.valid_shape` defines it, and a covered area is added and read back. Everything created
 * is deleted.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'devices-dev-test',
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

describe.skipIf(!DEV_STACK_ENABLED)('devices against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const stamp = Date.now();
  let facilityId = '';
  let areaId = '';
  let cameraId = '';

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
        pagination: { kind: 'offset', page: 1, pageSize: 50 },
        filter,
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  const gql = async (query: string): Promise<{ data?: Row; errors?: { message: string }[] }> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query }),
    });
    return (await response.json()) as { data?: Row; errors?: { message: string }[] };
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const { record: facility } = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test devices ${stamp}`, timezone: 'UTC' },
    });
    facilityId = String(facility.id);
    const { record: area } = await mutate(AREA_RESOURCE, {
      kind: 'createOne',
      input: { facility_id: facilityId, name: 'Hall', area_type: 'zone' },
    });
    areaId = String(area.id);
  });

  afterAll(async () => {
    if (cameraId) await mutate(DEVICE_RESOURCE, { kind: 'deleteOne', id: cameraId });
    if (areaId) await mutate(AREA_RESOURCE, { kind: 'deleteOne', id: areaId });
    if (facilityId) await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id: facilityId });
  });

  it('creates a camera with a password it never reads back', async () => {
    const { record } = await mutate(DEVICE_RESOURCE, {
      kind: 'createOne',
      input: {
        facility_id: facilityId,
        area_id: areaId,
        device_type: 'static_video_camera',
        name: `Hall camera ${stamp}`,
        stream_url: 'rtsp://10.0.0.20/hall',
        username: 'viewer',
        password: 'dev-test-secret',
        ip_address: '10.0.0.20',
        coverage: { type: 'Circle', center: [100, 100], radius: 40 },
        position: [100, 100],
      },
    });
    cameraId = String(record.id);
    expect(record).toMatchObject({
      code: expect.stringMatching(/^DEVICE-\d{5}$/),
      status: 'active',
      health_status: 'unknown',
      recognition_enabled: false,
      recognition_fps: 1,
      configuration: {},
      coverage: { type: 'Circle', center: [100, 100], radius: 40 },
    });
    expect(Object.hasOwn(record, 'password')).toBe(false);
    const refused = await gql(`query { devices_by_pk(id: "${cameraId}") { id password } }`);
    expect(refused.errors?.[0]?.message).toMatch(/password/);
  });

  it('edits the camera without a password and refuses what the database refuses', async () => {
    const { record } = await mutate(DEVICE_RESOURCE, {
      kind: 'updateOne',
      id: cameraId,
      input: { name: `Hall camera renamed ${stamp}`, recognition_fps: 3 },
    });
    expect(record).toMatchObject({ name: `Hall camera renamed ${stamp}`, recognition_fps: 3, username: 'viewer' });

    const credentials = 'rtsp://viewer:pw@10.0.0.20/hall';
    expect(streamUrlProblem(credentials)?.code).toBe('device.streamCredentials');
    await expect(
      mutate(DEVICE_RESOURCE, { kind: 'updateOne', id: cameraId, input: { stream_url: credentials } }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/no_credentials|[Cc]heck constraint/) });
    await expect(
      mutate(DEVICE_RESOURCE, { kind: 'updateOne', id: cameraId, input: { recognition_fps: 6 } }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/recognition_fps_range|[Cc]heck constraint/) });
  });

  it('adds a covered area and reads it back through the junction', async () => {
    const { record: second } = await mutate(AREA_RESOURCE, {
      kind: 'createOne',
      input: { facility_id: facilityId, name: 'Stairs', area_type: 'corridor' },
    });
    try {
      const { record: link } = await mutate(DEVICE_AREA_RESOURCE, {
        kind: 'createOne',
        input: { facility_id: facilityId, device_id: cameraId, area_id: second.id },
      });
      const covered = await list(DEVICE_AREA_RESOURCE, { field: 'device_id', op: 'eq', value: cameraId });
      expect(covered.map((row) => row.area_id)).toEqual([second.id]);
      await mutate(DEVICE_AREA_RESOURCE, { kind: 'deleteOne', id: link.id });
    } finally {
      await mutate(AREA_RESOURCE, { kind: 'deleteOne', id: second.id });
    }
  });
});
