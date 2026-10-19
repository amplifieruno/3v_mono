import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin, asOrgAdmin } from './clients.js';
import { createAccessPoint, createArea, createDevice, createFacility, type Area, type Device } from './facilities.js';
import { createTwoOrgs } from './fixtures.js';

const INSERT_DETECTION = `
  mutation InsertDetection($object: detections_insert_input!) {
    insert_detections_one(object: $object) { id facility_id area_id access_point_id identity_id detected_at }
  }
`;
const INSERT_IDENTITY = `mutation { insert_identities_one(object: {}) { id } }`;

export type Detection = {
  id: string;
  facility_id: string;
  area_id: string | null;
  access_point_id: string | null;
  identity_id: string | null;
  detected_at: string;
};
export type Session = {
  id: string;
  identity_id: string;
  facility_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  last_detected_at: string;
  last_area_id: string | null;
  last_access_point_id: string | null;
  last_location_access_point_id: string | null;
  opened_by_detection_id: string | null;
  areas_visited: string[];
};
export type Location = {
  detection_id: string | null;
  session_id: string | null;
  area_id: string | null;
  access_point_id: string | null;
  movement_type: string;
  occurred_at: string;
};
export type Occupancy = { area_id: string; session_id: string | null; entered_at: string; last_seen_at: string };

const BASE = Date.UTC(2026, 0, 5, 8, 0, 0);
/** ISO timestamp `s` seconds after a fixed base time (all tracking logic uses detected_at, never now()). */
export const at = (s: number): string => new Date(BASE + s * 1000).toISOString();

/**
 * One facility: Building > {Lobby, Floor 1 > Zone A}. Cameras: entrance (Lobby, bound to the entry/exit door),
 * lobby (Lobby, no door), floor (Zone A), exit-only (Lobby, door with direction `out`, not entry/exit).
 */
export async function createTrackingWorld() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const building = await createArea(a, facility.id, 'Building', null, { area_type: 'building' });
  const lobby = await createArea(a, facility.id, 'Lobby', building.id);
  const floor = await createArea(a, facility.id, 'Floor 1', building.id, { area_type: 'floor' });
  const zone = await createArea(a, facility.id, 'Zone A', floor.id);
  const entranceDoor = await createAccessPoint(a, facility.id, lobby.id, { is_entry_exit: true, direction: 'both' });
  const exitDoor = await createAccessPoint(a, facility.id, lobby.id, { direction: 'out' });
  const entranceCam = await createDevice(a, facility.id, { area_id: lobby.id });
  const lobbyCam = await createDevice(a, facility.id, { area_id: lobby.id });
  const floorCam = await createDevice(a, facility.id, { area_id: zone.id });
  const exitCam = await createDevice(a, facility.id, { area_id: lobby.id });
  await bindCamera(a, facility.id, entranceDoor.id, entranceCam.id);
  await bindCamera(a, facility.id, exitDoor.id, exitCam.id);
  const identity = await createIdentity(a);
  return {
    orgA, orgB, user, other, a, facility, building, lobby, floor, zone, entranceDoor, exitDoor,
    entranceCam, lobbyCam, floorCam, exitCam, identity,
  };
}
export type World = Awaited<ReturnType<typeof createTrackingWorld>>;

export async function bindCamera(a: HasuraClient, facilityId: string, apId: string, deviceId: string): Promise<void> {
  await a.request(
    `mutation($o: access_point_devices_insert_input!) { insert_access_point_devices_one(object: $o) { id } }`,
    { o: { facility_id: facilityId, access_point_id: apId, device_id: deviceId, role: 'camera' } },
  );
}

export async function createIdentity(a: HasuraClient): Promise<string> {
  return (await a.request<{ insert_identities_one: { id: string } }>(INSERT_IDENTITY)).insert_identities_one.id;
}

export async function detect(
  orgId: string,
  device: Device,
  identityId: string | null,
  seconds: number,
  extra: Record<string, unknown> = {},
): Promise<Detection> {
  const data = await asAdmin().request<{ insert_detections_one: Detection }>(INSERT_DETECTION, {
    object: {
      organization_id: orgId,
      device_id: device.id,
      identity_id: identityId,
      detected_at: at(seconds),
      confidence: 0.9,
      ...extra,
    },
  });
  return data.insert_detections_one;
}

const SESSION_FIELDS = `id identity_id facility_id status started_at ended_at duration_seconds last_detected_at
  last_area_id last_access_point_id last_location_access_point_id opened_by_detection_id areas_visited`;

export async function sessions(identityId: string): Promise<Session[]> {
  const data = await asAdmin().request<{ tracking_sessions: Session[] }>(
    `query($id: uuid!) { tracking_sessions(where: {identity_id: {_eq: $id}}, order_by: {started_at: asc}) { ${SESSION_FIELDS} } }`,
    { id: identityId },
  );
  return data.tracking_sessions;
}

export async function locations(identityId: string): Promise<Location[]> {
  const data = await asAdmin().request<{ identity_locations: Location[] }>(
    `query($id: uuid!) { identity_locations(where: {identity_id: {_eq: $id}}, order_by: {occurred_at: asc}) {
      detection_id session_id area_id access_point_id movement_type occurred_at } }`,
    { id: identityId },
  );
  return data.identity_locations;
}

export async function occupancy(identityId: string): Promise<Occupancy[]> {
  const data = await asAdmin().request<{ area_occupancy: Occupancy[] }>(
    `query($id: uuid!) { area_occupancy(where: {identity_id: {_eq: $id}}) { area_id session_id entered_at last_seen_at } }`,
    { id: identityId },
  );
  return data.area_occupancy;
}

export type IdentityCounters = { first_seen_at: string | null; last_seen_at: string | null; detection_count: number };

export async function identityCounters(identityId: string): Promise<IdentityCounters> {
  const data = await asAdmin().request<{ identities_by_pk: IdentityCounters }>(
    `query($id: uuid!) { identities_by_pk(id: $id) { first_seen_at last_seen_at detection_count } }`,
    { id: identityId },
  );
  return data.identities_by_pk;
}

export async function areaOccupancies(facilityId: string): Promise<Record<string, number>> {
  const data = await asAdmin().request<{ areas: (Pick<Area, 'name'> & { current_occupancy: number })[] }>(
    `query($f: uuid!) { areas(where: {facility_id: {_eq: $f}}) { name current_occupancy } }`,
    { f: facilityId },
  );
  return Object.fromEntries(data.areas.map((r) => [r.name, r.current_occupancy]));
}

export async function facilityOccupancy(facilityId: string): Promise<number> {
  const data = await asAdmin().request<{ facilities_by_pk: { current_occupancy: number } }>(
    `query($f: uuid!) { facilities_by_pk(id: $f) { current_occupancy } }`,
    { f: facilityId },
  );
  return data.facilities_by_pk.current_occupancy;
}
