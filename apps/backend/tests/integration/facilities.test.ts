import { describe, expect, it } from 'vitest';
import { asOrgAdmin, asUser, orgAdminToken } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import { createArea, createFacility, INSERT_FACILITY } from './support/facilities.js';

const FACILITIES = `query { facilities(order_by: { number: asc }) { id code name areas_count } }`;
const UPDATE_FACILITY = `
  mutation UpdateFacility($id: uuid!, $set: facilities_set_input!) {
    update_facilities_by_pk(pk_columns: { id: $id }, _set: $set) { id status }
  }
`;
const DELETE_FACILITY = `mutation DeleteFacility($id: uuid!) { delete_facilities_by_pk(id: $id) { id } }`;
const DELETE_AREA = `mutation DeleteArea($id: uuid!) { delete_areas_by_pk(id: $id) { id } }`;
const INSERT_FLOOR_PLAN = `
  mutation InsertFloorPlan($object: floor_plans_insert_input!) {
    insert_floor_plans_one(object: $object) { id area_id facility_id width_px height_px level area { name } }
  }
`;
const AUDIT = `
  query Audit($id: uuid!) { audit_log(where: { entity: { _eq: "facilities" }, entity_id: { _eq: $id } }) { action } }
`;

type Upload = { id: string } | { status: number };
const fileId = (u: Upload): string => {
  if (!('id' in u)) throw new Error(`upload failed with ${u.status}`);
  return u.id;
};

describe('facilities', () => {
  it('should number facilities per organization with FACILITY codes and defaults', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const first = await createFacility(a, { name: 'Nova Tower' });
    const second = await createFacility(a, { name: 'Riverside' });
    const otherOrg = await createFacility(asOrgAdmin(other.id, orgB.id), { name: 'Nova Tower' });
    expect(first).toMatchObject({
      code: 'FACILITY-00001',
      status: 'active',
      timezone: 'UTC',
      operating_hours: [],
      contact: {},
      organization_id: orgA.id,
    });
    expect(second.code).toBe('FACILITY-00002');
    expect(otherOrg.code).toBe('FACILITY-00001');
  });

  it('should accept valid coordinates, timezone and operating hours', async () => {
    const { orgA, user } = await createTwoOrgs();
    const f = await createFacility(asOrgAdmin(user.id, orgA.id), {
      latitude: 55.7558,
      longitude: -179.5,
      timezone: 'Europe/Moscow',
      operating_hours: [{ days: [1, 2, 3, 4, 5], from: '07:00', to: '22:00' }],
      contact: { phone: '+7 495 000-00-00', email: 'desk@nova.example' },
    });
    expect(f).toMatchObject({ latitude: 55.7558, longitude: -179.5, timezone: 'Europe/Moscow' });
  });

  it('should reject invalid operating hours, coordinates, timezone and contact', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const bad: Record<string, unknown>[] = [
      { operating_hours: [{ days: [1], from: '7:00', to: '22:00' }] },
      { operating_hours: { days: [1], from: '07:00', to: '22:00' } },
      { latitude: 90.5 },
      { latitude: -91 },
      { longitude: 180.01 },
      { longitude: -181 },
      { timezone: 'Mars/Olympus' },
      { contact: ['phone'] },
    ];
    for (const fields of bad) {
      await expectError(a.request(INSERT_FACILITY, { object: { name: `bad ${JSON.stringify(fields)}`, ...fields } }));
    }
  });

  it('should keep facility names unique per organization and isolate organizations', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a, { name: 'HQ' });
    const dup = await expectError(createFacility(a, { name: 'HQ' }));
    expect(dup.message).toMatch(/unique|uniqueness/i);
    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ facilities: unknown[] }>(FACILITIES)).facilities).toEqual([]);
    expect((await b.request<{ update_facilities_by_pk: unknown }>(UPDATE_FACILITY, { id: f.id, set: { name: 'x' } })).update_facilities_by_pk).toBeNull();
  });

  it('should count areas with the areas_count computed field', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const root = await createArea(a, f.id, 'Root', null, { area_type: 'building' });
    await createArea(a, f.id, 'Child', root.id);
    await createFacility(a);
    const list = await a.request<{ facilities: { id: string; areas_count: number }[] }>(FACILITIES);
    expect(list.facilities.map((x) => x.areas_count)).toEqual([2, 0]);
  });

  it('should block deleting a facility that has areas and allow archiving it by status (Review Focus 5)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const area = await createArea(a, f.id, 'Lobby', null, { area_type: 'entrance' });
    const err = await expectError(a.request(DELETE_FACILITY, { id: f.id }));
    expect(err.message).toMatch(/foreign key/i);
    const archived = await a.request<{ update_facilities_by_pk: { status: string } }>(UPDATE_FACILITY, {
      id: f.id,
      set: { status: 'inactive' },
    });
    expect(archived.update_facilities_by_pk.status).toBe('inactive');
    await a.request(DELETE_AREA, { id: area.id });
    expect((await a.request<{ delete_facilities_by_pk: { id: string } }>(DELETE_FACILITY, { id: f.id })).delete_facilities_by_pk.id).toBe(f.id);
  });

  it('should write an audit row on insert and hide facilities from the base user role', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const audit = await a.request<{ audit_log: { action: string }[] }>(AUDIT, { id: f.id });
    expect(audit.audit_log.map((r) => r.action)).toEqual(['insert']);
    await expectDenied(asUser(user.id).request(FACILITIES), 'facilities');
    await expectDenied(a.request(INSERT_FACILITY, { object: { name: 'n', number: 99 } }), 'number');
  });
});

describe('floor_plans', () => {
  it('should allow one floor plan per floor area with an image in the organization bucket', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const floor = await createArea(a, f.id, 'Floor 12', null, { area_type: 'floor' });
    const image = fileId(await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id, undefined, 'image/png'));
    const plan = await a.request<{ insert_floor_plans_one: { area: { name: string } } }>(INSERT_FLOOR_PLAN, {
      object: { facility_id: f.id, area_id: floor.id, name: 'Floor 12', image_file_id: image, width_px: 1200, height_px: 800, scale_m_per_px: 0.05, level: 12 },
    });
    expect(plan.insert_floor_plans_one.area.name).toBe('Floor 12');
    const dup = await expectError(
      a.request(INSERT_FLOOR_PLAN, { object: { facility_id: f.id, area_id: floor.id, name: 'again', width_px: 10, height_px: 10 } }),
    );
    expect(dup.message).toMatch(/unique|uniqueness/i);
  });

  it('should reject a floor plan whose area belongs to another facility, bad sizes and a foreign-bucket image', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const floor = await createArea(a, f2.id, 'Floor', null, { area_type: 'floor' });
    const fk = await expectError(
      a.request(INSERT_FLOOR_PLAN, { object: { facility_id: f1.id, area_id: floor.id, name: 'x', width_px: 10, height_px: 10 } }),
    );
    expect(fk.message).toMatch(/foreign key/i);
    await expectError(
      a.request(INSERT_FLOOR_PLAN, { object: { facility_id: f2.id, area_id: floor.id, name: 'x', width_px: 0, height_px: 10 } }),
    );
    const text = fileId(await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id));
    const notImage = await expectError(
      a.request(INSERT_FLOOR_PLAN, {
        object: { facility_id: f2.id, area_id: floor.id, name: 'x', width_px: 10, height_px: 10, image_file_id: text },
      }),
    );
    expect(notImage.message).toContain('floor_plan_not_image');
    const foreign = fileId(await uploadFile(orgAdminToken(other.id, orgB.id), orgB.id, undefined, 'image/png'));
    await expectError(
      a.request(INSERT_FLOOR_PLAN, {
        object: { facility_id: f2.id, area_id: floor.id, name: 'x', width_px: 10, height_px: 10, image_file_id: foreign },
      }),
    );
  });
});
