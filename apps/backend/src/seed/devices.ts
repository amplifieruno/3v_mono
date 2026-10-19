import type { OrgKey } from './companies.js';
import { isCamera, SEED_ACCESS_POINTS, SEED_DEVICES, streamUrl, type DeviceSpec } from './devicePlan.js';
import { lastWholeHour } from './deviceHealthPlan.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { repointCameraPhotos } from './cameraPhotos.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

export type SeededDevice = {
  id: string;
  org: OrgKey;
  name: string;
  camera: boolean;
  /** Has a stream_url, i.e. is probed by the live health check. */
  streaming: boolean;
  createdAt: string;
};

/** Seeded devices of both organizations, keyed `<org>/<device name>`. */
export type SeedDevicesResult = Record<string, SeededDevice>;

type Named = { id: string; name: string };

const ACCESS_POINTS = `
  query SeedAccessPoints($facility: uuid!) { access_points(where: { facility_id: { _eq: $facility } }) { id name } }
`;
const INSERT_ACCESS_POINTS = `
  mutation SeedInsertAccessPoints($objects: [access_points_insert_input!]!) {
    insert_access_points(objects: $objects) { affected_rows }
  }
`;
const DEVICES = `
  query SeedDevices($facility: uuid!) {
    devices(where: { facility_id: { _eq: $facility } }) { id name created_at }
  }
`;
const INSERT_DEVICES = `
  mutation SeedInsertDevices($objects: [devices_insert_input!]!) { insert_devices(objects: $objects) { affected_rows } }
`;
const RESET_UNPROBED = `
  mutation SeedResetUnprobed($ids: [uuid!]!) {
    update_devices(
      where: { id: { _in: $ids }, health_status: { _neq: unknown } }
      _set: { health_status: unknown, last_seen_at: null }
    ) { affected_rows }
  }
`;
// Earlier seeds enabled recognition on the stream cameras; a re-run turns it off again (no row changes otherwise).
const DISABLE_RECOGNITION = `
  mutation SeedDisableRecognition($ids: [uuid!]!) {
    update_devices(where: { id: { _in: $ids }, recognition_enabled: { _eq: true } }, _set: { recognition_enabled: false }) {
      affected_rows
    }
  }
`;
// Conflicts (an existing binding) do nothing: no update, no audit row.
const INSERT_BINDINGS = `
  mutation SeedInsertBindings($areas: [device_areas_insert_input!]!, $aps: [access_point_devices_insert_input!]!) {
    insert_device_areas(
      objects: $areas
      on_conflict: { constraint: device_areas_organization_id_device_id_area_id_key, update_columns: [] }
    ) { affected_rows }
    insert_access_point_devices(
      objects: $aps
      on_conflict: { constraint: access_point_devices_org_access_point_device_key, update_columns: [] }
    ) { affected_rows }
  }
`;

function lookup(map: Map<string, string> | Record<string, string>, key: string, what: string): string {
  const id = map instanceof Map ? map.get(key) : map[key];
  if (!id) throw new Error(`seed: unknown ${what} ${key}`);
  return id;
}

function deviceObject(
  ctx: SeedContext,
  base: { organization_id: string; facility_id: string },
  area: string,
  spec: DeviceSpec,
): Record<string, unknown> {
  const streaming = Boolean(spec.stream);
  return {
    ...base,
    name: spec.name,
    device_type: spec.type,
    area_id: area,
    position: spec.position ?? null,
    coverage: spec.coverage ? { type: 'Circle', center: spec.coverage.center, radius: spec.coverage.radius } : null,
    stream_url: spec.stream ? streamUrl(spec.stream) : null,
    resolution: isCamera(spec) ? '1920x1080' : null,
    fps: isCamera(spec) ? 25 : null,
    manufacturer: spec.manufacturer,
    model: spec.model,
    firmware_version: spec.firmware,
    ip_address: spec.ip,
    configuration: spec.configuration ?? {},
    // Live recognition is started on demand (recognition_start), the real UX; streaming cameras carry its fps.
    recognition_enabled: false,
    recognition_fps: streaming ? 2 : 1,
    // Streaming cameras get their state from the live health check; a camera without a stream is never probed, so its
    // state stays 'unknown'; the other devices get theirs from the (seeded) heartbeat history.
    ...(streaming || isCamera(spec) ? {} : { health_status: 'healthy', last_seen_at: lastWholeHour(ctx.now).toISOString() }),
  };
}

/**
 * Access points, devices and their bindings of both organizations (idempotent by name; bindings by their unique
 * keys), then the camera photos of the seeded faces re-pointed to the camera that captured them.
 */
export async function seedDevices(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  people: SeedPeopleResult,
): Promise<SeedDevicesResult> {
  const result: SeedDevicesResult = {};
  for (const key of Object.keys(SEED_DEVICES) as OrgKey[]) {
    const base = { organization_id: tenancy.orgs[key], facility_id: facilities.facilities[key] };
    const area = (path: string): string => lookup(facilities.areas, `${key}/${path}`, 'area');

    const before = await ctx.admin.request<{ access_points: Named[] }>(ACCESS_POINTS, { facility: base.facility_id });
    const haveAp = new Set(before.access_points.map((a) => a.name));
    const newAps = SEED_ACCESS_POINTS[key].filter((a) => !haveAp.has(a.name));
    if (newAps.length > 0) {
      await ctx.admin.request(INSERT_ACCESS_POINTS, {
        objects: newAps.map((a) => ({
          ...base,
          name: a.name,
          kind: a.kind,
          direction: a.direction ?? 'both',
          area_id: area(a.area),
          from_area_id: a.fromArea ? area(a.fromArea) : null,
          position: a.position ?? null,
          is_entry_exit: a.isEntryExit ?? false,
        })),
      });
    }
    const aps = await ctx.admin.request<{ access_points: Named[] }>(ACCESS_POINTS, { facility: base.facility_id });
    const apIds = new Map(aps.access_points.map((a) => [a.name, a.id]));

    const existing = await ctx.admin.request<{ devices: Named[] }>(DEVICES, { facility: base.facility_id });
    const haveDevice = new Set(existing.devices.map((d) => d.name));
    const newDevices = SEED_DEVICES[key].filter((d) => !haveDevice.has(d.name));
    if (newDevices.length > 0) {
      await ctx.admin.request(INSERT_DEVICES, { objects: newDevices.map((d) => deviceObject(ctx, base, area(d.area), d)) });
    }
    const { devices } = await ctx.admin.request<{ devices: (Named & { created_at: string })[] }>(DEVICES, {
      facility: base.facility_id,
    });
    const deviceIds = new Map(devices.map((d) => [d.name, d.id]));

    await ctx.admin.request(INSERT_BINDINGS, {
      areas: SEED_DEVICES[key].flatMap((d) =>
        (d.covers ?? []).map((c) => ({ ...base, device_id: lookup(deviceIds, d.name, 'device'), area_id: area(c) })),
      ),
      aps: SEED_DEVICES[key].flatMap((d) =>
        (d.accessPoints ?? []).map((b) => ({
          ...base,
          device_id: lookup(deviceIds, d.name, 'device'),
          access_point_id: lookup(apIds, b.name, 'access point'),
          role: b.role,
        })),
      ),
    });

    // Earlier seeds gave a camera without a stream a 'healthy' state; it is never probed, so it stays 'unknown'.
    const unprobed = SEED_DEVICES[key].filter((d) => isCamera(d) && !d.stream).map((d) => lookup(deviceIds, d.name, 'device'));
    if (unprobed.length > 0) await ctx.admin.request(RESET_UNPROBED, { ids: unprobed });
    await ctx.admin.request(DISABLE_RECOGNITION, { ids: SEED_DEVICES[key].map((d) => lookup(deviceIds, d.name, 'device')) });

    for (const spec of SEED_DEVICES[key]) {
      const row = devices.find((d) => d.name === spec.name);
      if (!row) throw new Error(`seed: device ${spec.name} missing`);
      result[`${key}/${spec.name}`] = { id: row.id, org: key, name: spec.name, camera: isCamera(spec), streaming: Boolean(spec.stream), createdAt: row.created_at };
    }
  }

  const cameraByStream: Record<string, string> = {};
  for (const d of SEED_DEVICES.nova) {
    const device = result[`nova/${d.name}`];
    if (d.stream && device) cameraByStream[d.stream] = device.id;
  }
  await repointCameraPhotos(ctx, tenancy.orgs.nova, people, cameraByStream);
  return result;
}
