import type { HasuraClient } from '../../../src/hasura/client.js';

export const INSERT_FACILITY = `
  mutation InsertFacility($object: facilities_insert_input!) {
    insert_facilities_one(object: $object) {
      id number code name status timezone operating_hours contact latitude longitude organization_id
    }
  }
`;
export const INSERT_AREA = `
  mutation InsertArea($object: areas_insert_input!) {
    insert_areas_one(object: $object) { id facility_id parent_id path depth name area_type access_level status }
  }
`;
export const MOVE_AREA = `
  mutation MoveArea($id: uuid!, $parent: uuid) {
    update_areas_by_pk(pk_columns: { id: $id }, _set: { parent_id: $parent }) { id parent_id path depth }
  }
`;
export const AREAS = `
  query Areas($facility: uuid!) {
    areas(where: { facility_id: { _eq: $facility } }, order_by: [{ depth: asc }, { name: asc }]) {
      id name parent_id path depth current_occupancy
    }
  }
`;

export type Facility = {
  id: string;
  number: number;
  code: string;
  name: string;
  status: string;
  timezone: string;
  operating_hours: unknown;
  contact: unknown;
  latitude: number | null;
  longitude: number | null;
  organization_id: string;
};
export type Area = {
  id: string;
  facility_id: string;
  parent_id: string | null;
  path: string[];
  depth: number;
  name: string;
  area_type: string;
  access_level: string;
  status: string;
};

export async function createFacility(client: HasuraClient, object: Record<string, unknown> = {}): Promise<Facility> {
  const data = await client.request<{ insert_facilities_one: Facility }>(INSERT_FACILITY, {
    object: { name: `Facility ${Math.random().toString(36).slice(2, 10)}`, ...object },
  });
  return data.insert_facilities_one;
}

export async function createArea(
  client: HasuraClient,
  facilityId: string,
  name: string,
  parentId: string | null = null,
  extra: Record<string, unknown> = {},
): Promise<Area> {
  const data = await client.request<{ insert_areas_one: Area }>(INSERT_AREA, {
    object: { facility_id: facilityId, parent_id: parentId, name, area_type: 'zone', ...extra },
  });
  return data.insert_areas_one;
}

/** Building -> Floor -> Zone -> Room (4 levels) plus a second floor, in one facility. */
export type Tree = Record<'building' | 'floor1' | 'floor2' | 'zone' | 'room', Area>;

export async function createTree(client: HasuraClient, facilityId: string): Promise<Tree> {
  const building = await createArea(client, facilityId, 'Building', null, { area_type: 'building' });
  const floor1 = await createArea(client, facilityId, 'Floor 1', building.id, { area_type: 'floor' });
  const floor2 = await createArea(client, facilityId, 'Floor 2', building.id, { area_type: 'floor' });
  const zone = await createArea(client, facilityId, 'Zone A', floor1.id);
  const room = await createArea(client, facilityId, 'Room 101', zone.id, { area_type: 'room' });
  return { building, floor1, floor2, zone, room };
}

export const INSERT_DEVICE = `
  mutation InsertDevice($object: devices_insert_input!) {
    insert_devices_one(object: $object) {
      id number code name device_type facility_id area_id status health_status recognition_enabled recognition_fps
      username organization_id
    }
  }
`;
export const INSERT_ACCESS_POINT = `
  mutation InsertAccessPoint($object: access_points_insert_input!) {
    insert_access_points_one(object: $object) { id facility_id area_id from_area_id name kind direction is_entry_exit status }
  }
`;

export type Device = {
  id: string;
  number: number;
  code: string;
  name: string;
  device_type: string;
  facility_id: string;
  area_id: string | null;
  status: string;
  health_status: string;
  recognition_enabled: boolean;
  recognition_fps: number;
  username: string | null;
  organization_id: string;
};
export type AccessPoint = {
  id: string;
  facility_id: string;
  area_id: string;
  from_area_id: string | null;
  name: string;
  kind: string;
  direction: string;
  is_entry_exit: boolean;
  status: string;
};

export async function createDevice(
  client: HasuraClient,
  facilityId: string,
  extra: Record<string, unknown> = {},
): Promise<Device> {
  const data = await client.request<{ insert_devices_one: Device }>(INSERT_DEVICE, {
    object: {
      facility_id: facilityId,
      name: `Device ${Math.random().toString(36).slice(2, 10)}`,
      device_type: 'static_video_camera',
      ...extra,
    },
  });
  return data.insert_devices_one;
}

export async function createAccessPoint(
  client: HasuraClient,
  facilityId: string,
  areaId: string,
  extra: Record<string, unknown> = {},
): Promise<AccessPoint> {
  const data = await client.request<{ insert_access_points_one: AccessPoint }>(INSERT_ACCESS_POINT, {
    object: {
      facility_id: facilityId,
      area_id: areaId,
      name: `Door ${Math.random().toString(36).slice(2, 10)}`,
      kind: 'door',
      ...extra,
    },
  });
  return data.insert_access_points_one;
}
