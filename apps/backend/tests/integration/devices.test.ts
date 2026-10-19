import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin, orgAdminToken } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createArea, createDevice, createFacility, INSERT_DEVICE } from './support/facilities.js';
import { createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

const UPDATE_DEVICE = `
  mutation UpdateDevice($id: uuid!, $set: devices_set_input!) {
    update_devices_by_pk(pk_columns: { id: $id }, _set: $set) { id status username }
  }
`;
const DELETE_DEVICE = `mutation DeleteDevice($id: uuid!) { delete_devices_by_pk(id: $id) { id } }`;
const DELETE_FACILITY = `mutation DeleteFacility($id: uuid!) { delete_facilities_by_pk(id: $id) { id } }`;
const DELETE_AREA = `mutation DeleteArea($id: uuid!) { delete_areas_by_pk(id: $id) { id } }`;
const INSERT_DEVICE_AREA = `
  mutation InsertDeviceArea($object: device_areas_insert_input!) {
    insert_device_areas_one(object: $object) { id device_id area_id facility_id }
  }
`;
const PASSWORD_QUERY = `query { devices { id password } }`;
const DEVICE_AREAS = `query($id: uuid!) { devices_by_pk(id: $id) { device_areas { area_id } } }`;

describe('devices', () => {
  it('should number devices per organization with DEVICE codes and defaults', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const first = await createDevice(a, f.id);
    const second = await createDevice(a, f.id, { device_type: 'access_terminal' });
    const otherFacility = await createFacility(asOrgAdmin(other.id, orgB.id));
    const otherOrg = await createDevice(asOrgAdmin(other.id, orgB.id), otherFacility.id);
    expect(first).toMatchObject({
      code: 'DEVICE-00001',
      status: 'active',
      health_status: 'unknown',
      recognition_enabled: false,
      recognition_fps: 1,
      area_id: null,
    });
    expect(second.code).toBe('DEVICE-00002');
    expect(otherOrg.code).toBe('DEVICE-00001');
  });

  it('should accept configuration fields and reject invalid enums, fps and recognition_fps', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    await createDevice(a, f.id, {
      stream_url: 'rtsp://cam/1',
      resolution: '1920x1080',
      fps: 25,
      ip_address: '10.0.0.12',
      manufacturer: 'Hikvision',
      configuration: { codec: 'h264' },
      position: [10, 20],
      coverage: { type: 'Circle', center: [10, 20], radius: 5 },
      recognition_enabled: true,
      recognition_fps: 5,
    });
    const bad: Record<string, unknown>[] = [
      { device_type: 'toaster' },
      { status: 'exploded' },
      { recognition_fps: 0 },
      { recognition_fps: 6 },
      { fps: 0 },
      { coverage: { type: 'Polygon', coordinates: [] } },
      { configuration: [] },
    ];
    for (const fields of bad) {
      await expectError(a.request(INSERT_DEVICE, { object: { facility_id: f.id, name: 'bad', device_type: 'sensor', ...fields } }));
    }
  });

  it('should reject a stream_url that embeds credentials and accept a plain one', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    for (const stream_url of ['rtsp://user:pass@host/x', 'rtsp://user@host:554/x', 'http://:secret@host/x']) {
      await expectError(
        a.request(INSERT_DEVICE, { object: { facility_id: f.id, name: 'bad', device_type: 'static_video_camera', stream_url } }),
      );
    }
    const ok = await createDevice(a, f.id, { device_type: 'static_video_camera', stream_url: 'rtsp://host:554/path?token=a@b' });
    expect(ok.id).toBeTruthy();
    await expectError(
      a.request(UPDATE_DEVICE, { id: ok.id, set: { stream_url: 'rtsp://u:p@host/x' } }),
    );
  });

  it('should accept a writable password that is never selectable and is redacted in audit', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const d = await createDevice(a, f.id, { username: 'admin', password: 'hunter2-secret' });
    expect(d.username).toBe('admin');
    await expectDenied(a.request(PASSWORD_QUERY), 'password');
    await a.request(UPDATE_DEVICE, { id: d.id, set: { username: 'root' } });
    await a.request(UPDATE_DEVICE, { id: d.id, set: { password: 'another-secret' } });
    const stored = await runSqlRows(`select password from itap.devices where id = '${d.id}'`);
    expect(stored[0].password).toBe('another-secret');
    const audit = await runSqlRows(
      `select action, changes::text as changes from itap.audit_log where entity = 'devices' and entity_id = '${d.id}' order by occurred_at`,
    );
    expect(audit.map((r) => r.action)).toEqual(['insert', 'update', 'update']);
    for (const row of audit) {
      expect(row.changes).not.toContain('hunter2-secret');
      expect(row.changes).not.toContain('another-secret');
    }
    expect(audit[0].changes).toContain('[redacted]');
  });

  it('should keep system-managed columns read-only and keep health updates out of the audit', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const d = await createDevice(a, f.id);
    for (const [column, value] of [
      ['health_status', 'healthy'],
      ['last_seen_at', new Date().toISOString()],
      ['policy_version_synced', 3],
      ['policy_synced_at', new Date().toISOString()],
      ['number', 99],
    ] as const) {
      await expectDenied(a.request(UPDATE_DEVICE, { id: d.id, set: { [column]: value } }), column);
      await expectDenied(a.request(INSERT_DEVICE, { object: { facility_id: f.id, name: 'x', device_type: 'sensor', [column]: value } }), column);
    }
    await expectDenied(a.request(UPDATE_DEVICE, { id: d.id, set: { facility_id: f.id } }), 'facility_id');
    await runSql(
      `update itap.devices set health_status = 'healthy', last_seen_at = now(), policy_version_synced = 2, policy_synced_at = now() where id = '${d.id}'`,
    );
    const audit = await runSqlRows(`select action from itap.audit_log where entity = 'devices' and entity_id = '${d.id}'`);
    expect(audit.map((r) => r.action)).toEqual(['insert']);
  });

  it('should reject an area of another facility of the same organization (Review Focus 2)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const own = await createArea(a, f1.id, 'Lobby');
    const foreign = await createArea(a, f2.id, 'Lobby');
    const ok = await createDevice(a, f1.id, { area_id: own.id });
    expect(ok.area_id).toBe(own.id);
    const err = await expectError(a.request(INSERT_DEVICE, { object: { facility_id: f1.id, name: 'x', device_type: 'sensor', area_id: foreign.id } }));
    expect(err.message).toContain('devices_area_fkey');
    const d = await createDevice(a, f1.id);
    const moveErr = await expectError(a.request(UPDATE_DEVICE, { id: d.id, set: { area_id: foreign.id } }));
    expect(moveErr.message).toContain('devices_area_fkey');
  });

  it('should reject areas and facilities of another organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const fb = await createFacility(asOrgAdmin(other.id, orgB.id));
    const areaB = await createArea(asOrgAdmin(other.id, orgB.id), fb.id, 'Lobby');
    await expectError(a.request(INSERT_DEVICE, { object: { facility_id: fb.id, name: 'x', device_type: 'sensor' } }));
    await expectError(a.request(INSERT_DEVICE, { object: { facility_id: f.id, name: 'x', device_type: 'sensor', area_id: areaB.id } }));
  });

  it('should link additional covered areas only within the device facility', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const lobby = await createArea(a, f1.id, 'Lobby');
    const hall = await createArea(a, f1.id, 'Hall');
    const foreign = await createArea(a, f2.id, 'Foreign');
    const d = await createDevice(a, f1.id, { area_id: lobby.id });
    await a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: hall.id, facility_id: f1.id } });
    await a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: lobby.id, facility_id: f1.id } });
    const err = await expectError(a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: foreign.id, facility_id: f1.id } }));
    expect(err.message).toContain('device_areas_area_fkey');
    const wrongFacility = await expectError(a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: foreign.id, facility_id: f2.id } }));
    expect(wrongFacility.message).toContain('device_areas_device_fkey');
    await expectError(a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: hall.id, facility_id: f1.id } }));
    const rows = await a.request<{ devices_by_pk: { device_areas: { area_id: string }[] } }>(DEVICE_AREAS, { id: d.id });
    expect(rows.devices_by_pk.device_areas.map((r) => r.area_id).sort()).toEqual([hall.id, lobby.id].sort());
  });

  it('should block deleting referenced areas and facilities, and delete a device with its area links', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const area = await createArea(a, f.id, 'Lobby');
    const extra = await createArea(a, f.id, 'Hall');
    const d = await createDevice(a, f.id, { area_id: area.id });
    await a.request(INSERT_DEVICE_AREA, { object: { device_id: d.id, area_id: extra.id, facility_id: f.id } });
    await expectError(a.request(DELETE_AREA, { id: area.id }));
    await expectError(a.request(DELETE_AREA, { id: extra.id }));
    await expectError(a.request(DELETE_FACILITY, { id: f.id }));
    await a.request(DELETE_DEVICE, { id: d.id });
    const links = await runSqlRows(`select count(*) as n from itap.device_areas where device_id = '${d.id}'`);
    expect(links[0].n).toBe('0');
    await a.request(DELETE_AREA, { id: extra.id });
  });

  it('should set identity_photos.device_id to null when the device is deleted and reject foreign devices', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const d = await createDevice(a, f.id);
    const dB = await createDevice(asOrgAdmin(other.id, orgB.id), (await createFacility(asOrgAdmin(other.id, orgB.id))).id);
    const identity = await createIdentity(user.id, orgA.id);
    const file = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id, undefined, 'image/png');
    if (!('id' in file)) throw new Error('upload failed');
    const photo = await asAdmin().request<{ insert_identity_photos_one: { id: string } }>(
      `mutation($object: identity_photos_insert_input!) { insert_identity_photos_one(object: $object) { id } }`,
      { object: { organization_id: orgA.id, identity_id: identity.id, file_id: file.id, device_id: d.id } },
    );
    const id = photo.insert_identity_photos_one.id;
    const before = await runSqlRows(`select device_id from itap.identity_photos where id = '${id}'`);
    expect(before[0].device_id).toBe(d.id);
    await expect(
      runSql(`update itap.identity_photos set device_id = '${dB.id}' where id = '${id}'`),
    ).rejects.toThrow(/identity_photos_device_fkey/);
    await a.request(DELETE_DEVICE, { id: d.id });
    const after = await runSqlRows(`select device_id, organization_id from itap.identity_photos where id = '${id}'`);
    expect(after[0].device_id).toBe('NULL');
    expect(after[0].organization_id).toBe(orgA.id);
  });
});
