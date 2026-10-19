import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createAccessPoint, createArea, createDevice, createFacility, INSERT_ACCESS_POINT } from './support/facilities.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';

const INSERT_BINDING = `
  mutation InsertBinding($object: access_point_devices_insert_input!) {
    insert_access_point_devices_one(object: $object) { id access_point_id device_id role facility_id }
  }
`;
const UPDATE_BINDING = `
  mutation UpdateBinding($id: uuid!, $role: access_point_device_roles_enum!) {
    update_access_point_devices_by_pk(pk_columns: { id: $id }, _set: { role: $role }) { id role }
  }
`;
const DELETE_ACCESS_POINT = `mutation($id: uuid!) { delete_access_points_by_pk(id: $id) { id } }`;
const DELETE_DEVICE = `mutation($id: uuid!) { delete_devices_by_pk(id: $id) { id } }`;
const BINDINGS = `
  query($id: uuid!) { access_points_by_pk(id: $id) { access_point_devices { role device { code } } area { name } from_area { name } } }
`;
const INSERT_TEMPLATE = `
  mutation InsertTemplate($object: facility_templates_insert_input!) {
    insert_facility_templates_one(object: $object) { id name structure }
  }
`;

describe('access_points', () => {
  it('should create access points with defaults and resolve both areas', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const lobby = await createArea(a, f.id, 'Lobby', null, { area_type: 'entrance' });
    const street = await createArea(a, f.id, 'Street');
    const ap = await createAccessPoint(a, f.id, lobby.id, { from_area_id: street.id, kind: 'turnstile', direction: 'in', is_entry_exit: true });
    expect(ap).toMatchObject({ kind: 'turnstile', direction: 'in', is_entry_exit: true, status: 'active', from_area_id: street.id });
    const plain = await createAccessPoint(a, f.id, lobby.id);
    expect(plain).toMatchObject({ direction: 'both', is_entry_exit: false, from_area_id: null });
    const read = await a.request<{ access_points_by_pk: { area: { name: string }; from_area: { name: string } } }>(BINDINGS, { id: ap.id });
    expect(read.access_points_by_pk).toMatchObject({ area: { name: 'Lobby' }, from_area: { name: 'Street' } });
  });

  it('should reject invalid kinds and directions, equal areas and areas of another facility (Review Focus 2)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const lobby = await createArea(a, f1.id, 'Lobby');
    const foreign = await createArea(a, f2.id, 'Foreign');
    const base = { facility_id: f1.id, area_id: lobby.id, name: 'Door' };
    await expectError(a.request(INSERT_ACCESS_POINT, { object: { ...base, kind: 'portal' } }));
    await expectError(a.request(INSERT_ACCESS_POINT, { object: { ...base, kind: 'door', direction: 'sideways' } }));
    await expectError(a.request(INSERT_ACCESS_POINT, { object: { ...base, kind: 'door', from_area_id: lobby.id } }));
    const area = await expectError(a.request(INSERT_ACCESS_POINT, { object: { ...base, kind: 'door', area_id: foreign.id } }));
    expect(area.message).toContain('access_points_area_fkey');
    const from = await expectError(a.request(INSERT_ACCESS_POINT, { object: { ...base, kind: 'door', from_area_id: foreign.id } }));
    expect(from.message).toContain('access_points_from_area_fkey');
  });

  it('should bind devices of the same facility with a role and reject other facilities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const lobby = await createArea(a, f1.id, 'Lobby');
    const ap = await createAccessPoint(a, f1.id, lobby.id);
    const camera = await createDevice(a, f1.id);
    const terminal = await createDevice(a, f1.id, { device_type: 'access_terminal' });
    const foreign = await createDevice(a, f2.id);
    const bind = (deviceId: string, role: string, facilityId = f1.id) =>
      a.request<{ insert_access_point_devices_one: { id: string } }>(INSERT_BINDING, {
        object: { facility_id: facilityId, access_point_id: ap.id, device_id: deviceId, role },
      });
    const cameraBinding = (await bind(camera.id, 'camera')).insert_access_point_devices_one.id;
    await bind(terminal.id, 'terminal');
    const dup = await expectError(bind(camera.id, 'camera'));
    expect(dup.message).toMatch(/duplicate|unique|constraint/i);
    await expectError(bind(foreign.id, 'sensor'));
    const wrong = await expectError(bind(foreign.id, 'sensor', f2.id));
    expect(wrong.message).toContain('access_point_devices_access_point_fkey');
    await expectError(bind(terminal.id, 'toaster'));
    await a.request(UPDATE_BINDING, { id: cameraBinding, role: 'sensor' });
    const read = await a.request<{ access_points_by_pk: { access_point_devices: { role: string; device: { code: string } }[] } }>(BINDINGS, { id: ap.id });
    expect(read.access_points_by_pk.access_point_devices.map((b) => `${b.role}:${b.device.code}`).sort()).toEqual([
      'sensor:DEVICE-00001',
      'terminal:DEVICE-00002',
    ]);
  });

  it('should drop bindings when an access point or a device is deleted', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const lobby = await createArea(a, f.id, 'Lobby');
    const ap1 = await createAccessPoint(a, f.id, lobby.id);
    const ap2 = await createAccessPoint(a, f.id, lobby.id);
    const d = await createDevice(a, f.id);
    for (const ap of [ap1, ap2]) {
      await a.request(INSERT_BINDING, { object: { facility_id: f.id, access_point_id: ap.id, device_id: d.id, role: 'camera' } });
    }
    const count = async (): Promise<string | null> =>
      (await runSqlRows(`select count(*) as n from itap.access_point_devices where device_id = '${d.id}'`))[0].n;
    expect(await count()).toBe('2');
    await a.request(DELETE_ACCESS_POINT, { id: ap1.id });
    expect(await count()).toBe('1');
    await a.request(DELETE_DEVICE, { id: d.id });
    expect(await count()).toBe('0');
  });

  it('should block deleting an area that an access point references', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const lobby = await createArea(a, f.id, 'Lobby');
    await createAccessPoint(a, f.id, lobby.id);
    await expectError(a.request(`mutation($id: uuid!) { delete_areas_by_pk(id: $id) { id } }`, { id: lobby.id }));
  });
});

describe('facility_templates', () => {
  const node = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ name: 'Floor', area_type: 'floor', ...extra });

  it('should accept a valid area tree and keep names unique per organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const structure = [
      node({
        name: 'Standard floor',
        access_level: 'restricted',
        capacity: 120,
        children: [
          node({ name: 'Open space', area_type: 'zone', capacity: 80 }),
          node({ name: 'Meeting rooms', area_type: 'zone', children: [node({ name: 'Room 1', area_type: 'room', capacity: 8 })] }),
        ],
      }),
    ];
    const r = await a.request<{ insert_facility_templates_one: { id: string } }>(INSERT_TEMPLATE, { object: { name: 'Office floor', structure } });
    expect(r.insert_facility_templates_one.id).toBeTruthy();
    await expectError(a.request(INSERT_TEMPLATE, { object: { name: 'Office floor', structure } }));
    await asOrgAdmin(other.id, orgB.id).request(INSERT_TEMPLATE, { object: { name: 'Office floor', structure } });
  });

  it('should reject malformed template structures', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const chain = (depth: number): Record<string, unknown> =>
      depth <= 1 ? node({ area_type: 'zone' }) : node({ area_type: 'zone', children: [chain(depth - 1)] });
    const wide = { ...node(), children: Array.from({ length: 200 }, () => node({ area_type: 'room' })) };
    const bad: [string, unknown][] = [
      ['not an array', node()],
      ['empty', []],
      ['scalar node', ['x']],
      ['no name', [{ area_type: 'room' }]],
      ['blank name', [node({ name: '  ' })]],
      ['no area_type', [{ name: 'x' }]],
      ['unknown area_type', [node({ area_type: 'spaceship' })]],
      ['unknown access_level', [node({ access_level: 'top' })]],
      ['negative capacity', [node({ capacity: -1 })]],
      ['fractional capacity', [node({ capacity: 1.5 })]],
      ['string capacity', [node({ capacity: '5' })]],
      ['extra key', [node({ color: 'red' })]],
      ['children not array', [node({ children: node() })]],
      ['bad nested child', [node({ children: [node({ area_type: 'nope' })] })]],
      ['too deep (7 levels)', [chain(7)]],
      ['too many nodes (201)', [wide]],
    ];
    for (const [label, structure] of bad) {
      await expectError(a.request(INSERT_TEMPLATE, { object: { name: `bad ${label}`, structure } }));
    }
  });

  it('should accept the depth and node-count limits exactly', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const chain = (depth: number): Record<string, unknown> =>
      depth <= 1 ? node({ area_type: 'zone' }) : node({ area_type: 'zone', children: [chain(depth - 1)] });
    const wide = { ...node(), children: Array.from({ length: 199 }, () => node({ area_type: 'room' })) };
    await a.request(INSERT_TEMPLATE, { object: { name: 'deep', structure: [chain(6)] } });
    await a.request(INSERT_TEMPLATE, { object: { name: 'wide', structure: [wide] } });
  });
});
