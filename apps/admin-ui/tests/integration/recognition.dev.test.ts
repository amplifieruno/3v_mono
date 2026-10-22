import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { HEALTH_CHART_BINDING } from '../../src/blocks/health-chart/health-series-query';
import { healthSeries } from '../../src/blocks/health-chart/health-series';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  DEVICE_EVENT_RESOURCE,
  DEVICE_HEALTH_METRIC_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
} from '../../src/data/resource-names';
import { DEVICES_BINDING, recognitionStatusOutput } from '../../src/modules/devices/recognition';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Recognition control, health and events against the dev stack (Nova, `org_admin`). The status
 * of a seeded camera is read; on a camera created for the test, start is refused while it is
 * under maintenance, then start and stop return the real flag (Review Focus 5) and the device
 * follows; a sensor is refused as not a camera. A seeded camera's 24-hour health series and its
 * event and sample logs are read through cursor pages without a count. The test camera is set
 * back to maintenance at once (the health check probes active cameras only) and deleted.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'recognition-dev-test',
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

describe.skipIf(!DEV_STACK_ENABLED)('recognition, health and events against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const stamp = Date.now();
  let facilityId = '';
  let cameraId = '';
  let sensorId = '';
  let seededCameraId = '';

  const mutate = (resource: string, input: Row) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({ ...IDENTITY, ref: ref(resource), resource, idField: 'id', ...input } as never) as never,
      context(),
    ) as Promise<{ record: Row }>;

  const custom = (kind: 'query' | 'mutation', resource: string, operation: string, input: Row) => {
    const spec = { ...IDENTITY, kind: 'custom', ref: ref(operation), resource, operation, input } as never;
    return kind === 'query'
      ? provider.queries?.custom?.(createQueryDescriptor(spec) as never, context())
      : provider.mutations?.custom?.(createMutationDescriptor(spec) as never, context());
  };

  const cursorPage = async (resource: string, field: string, value: string, sort: string) =>
    (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: { kind: 'cursor', limit: 5 },
        sort: [
          { field: sort, direction: 'desc' },
          { field: 'id', direction: 'desc' },
        ],
        filter: { field, op: 'eq', value },
      } as never) as never,
      context(),
    )) as { data: readonly Row[]; total?: number; pageInfo?: { hasNextPage: boolean } };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query: '{ devices(where: { name: { _eq: "Lobby Camera" } }) { id } }' }),
    });
    const body = (await response.json()) as { data?: { devices?: { id: string }[] } };
    seededCameraId = body.data?.devices?.[0]?.id ?? '';
    expect(seededCameraId).not.toBe('');

    const { record: facility } = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test recognition ${stamp}`, timezone: 'UTC' },
    });
    facilityId = String(facility.id);
    const { record: camera } = await mutate(DEVICE_RESOURCE, {
      kind: 'createOne',
      input: {
        facility_id: facilityId,
        device_type: 'static_video_camera',
        name: `Recognition camera ${stamp}`,
        stream_url: `rtsp://stream-server:8554/dev-test-${stamp}`,
        status: 'maintenance',
      },
    });
    cameraId = String(camera.id);
    const { record: sensor } = await mutate(DEVICE_RESOURCE, {
      kind: 'createOne',
      input: { facility_id: facilityId, device_type: 'sensor', name: `Door sensor ${stamp}`, status: 'maintenance' },
    });
    sensorId = String(sensor.id);
  });

  afterAll(async () => {
    for (const id of [cameraId, sensorId]) if (id) await mutate(DEVICE_RESOURCE, { kind: 'deleteOne', id });
    if (facilityId) await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id: facilityId });
  });

  it('should read the recognition status of a seeded camera', async () => {
    const status = recognitionStatusOutput.parse(
      await custom('query', DEVICES_BINDING, 'recognitionStatus', { deviceId: seededCameraId }),
    );
    expect(status.device_id).toBe(seededCameraId);
    expect(typeof status.running).toBe('boolean');
  });

  it('should refuse a camera under maintenance and a sensor', async () => {
    await expect(
      custom('mutation', DEVICES_BINDING, 'recognitionStart', { deviceId: cameraId }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/active cameras only/) });
    await expect(
      custom('query', DEVICES_BINDING, 'recognitionStatus', { deviceId: sensorId }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/cameras only/) });
  });

  it('should start and stop recognition and return the real flag', async () => {
    await mutate(DEVICE_RESOURCE, { kind: 'updateOne', id: cameraId, input: { status: 'active' } });
    try {
      const started = recognitionStatusOutput.parse(
        await custom('mutation', DEVICES_BINDING, 'recognitionStart', { deviceId: cameraId }),
      );
      expect(started).toMatchObject({ device_id: cameraId, enabled: true });
      const stopped = recognitionStatusOutput.parse(
        await custom('mutation', DEVICES_BINDING, 'recognitionStop', { deviceId: cameraId }),
      );
      expect(stopped).toMatchObject({ device_id: cameraId, enabled: false });
    } finally {
      await mutate(DEVICE_RESOURCE, { kind: 'updateOne', id: cameraId, input: { status: 'maintenance' } });
    }
    const status = recognitionStatusOutput.parse(
      await custom('query', DEVICES_BINDING, 'recognitionStatus', { deviceId: cameraId }),
    );
    expect(status.enabled).toBe(false);
  });

  it('should read a seeded camera’s health over the last 24 hours', async () => {
    const series = healthSeries.parse(
      await custom('query', HEALTH_CHART_BINDING, 'deviceHealthSeries', { deviceId: seededCameraId }),
    );
    expect(series.points).toHaveLength(96);
    expect(series.points.some((point) => point.samples > 0 && point.latency !== null)).toBe(true);
  });

  it('should page the health samples and the events by cursor without a count', async () => {
    const samples = await cursorPage(DEVICE_HEALTH_METRIC_RESOURCE, 'device_id', seededCameraId, 'recorded_at');
    expect(samples.data).toHaveLength(5);
    expect(samples.total).toBeUndefined();
    expect(samples.pageInfo?.hasNextPage).toBe(true);
    const times = samples.data.map((row) => String(row.recorded_at));
    expect([...times].sort().reverse()).toEqual(times);

    const events = await cursorPage(DEVICE_EVENT_RESOURCE, 'device_id', seededCameraId, 'occurred_at');
    expect(events.total).toBeUndefined();
    expect(events.data.every((row) => typeof row.kind === 'string')).toBe(true);
  });
});
