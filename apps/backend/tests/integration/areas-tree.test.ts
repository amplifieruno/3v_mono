import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { runSql } from './support/sql.js';
import { AREAS, createArea, createFacility, createTree, INSERT_AREA, MOVE_AREA, type Area } from './support/facilities.js';

const DESCENDANTS = `
  query Descendants($area: uuid!) {
    area_descendants(args: { p_area: $area }, order_by: [{ depth: asc }, { name: asc }]) {
      id name parent_id area_type depth organization_id
    }
  }
`;
const DELETE_AREA = `mutation DeleteArea($id: uuid!) { delete_areas_by_pk(id: $id) { id } }`;
const SET_PATH = `
  mutation SetPath($id: uuid!) { update_areas_by_pk(pk_columns: { id: $id }, _set: { path: "{}" }) { id } }
`;

type Row = { id: string; name: string; parent_id: string | null; path: string[]; depth: number; current_occupancy: number };

async function areasById(client: ReturnType<typeof asOrgAdmin>, facility: string): Promise<Map<string, Row>> {
  const data = await client.request<{ areas: Row[] }>(AREAS, { facility });
  return new Map(data.areas.map((r) => [r.id, r]));
}

describe('areas tree', () => {
  it('should maintain path (root .. self) and depth for a 4-level tree', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const { building, floor1, zone, room } = await createTree(a, f.id);
    expect(building).toMatchObject({ path: [building.id], depth: 0 });
    expect(floor1).toMatchObject({ path: [building.id, floor1.id], depth: 1 });
    expect(zone).toMatchObject({ path: [building.id, floor1.id, zone.id], depth: 2 });
    expect(room).toMatchObject({ path: [building.id, floor1.id, zone.id, room.id], depth: 3 });
    const rows = await areasById(a, f.id);
    expect(rows.get(room.id)?.current_occupancy).toBe(0);
  });

  it('should recompute the whole subtree when an area is re-parented', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const { building, floor1, floor2, zone, room } = await createTree(a, f.id);

    const moved = await a.request<{ update_areas_by_pk: Area }>(MOVE_AREA, { id: zone.id, parent: floor2.id });
    expect(moved.update_areas_by_pk).toMatchObject({ path: [building.id, floor2.id, zone.id], depth: 2 });
    let rows = await areasById(a, f.id);
    expect(rows.get(room.id)).toMatchObject({ path: [building.id, floor2.id, zone.id, room.id], depth: 3 });
    expect(rows.get(floor1.id)).toMatchObject({ path: [building.id, floor1.id], depth: 1 });

    await a.request(MOVE_AREA, { id: zone.id, parent: null });
    rows = await areasById(a, f.id);
    expect(rows.get(zone.id)).toMatchObject({ path: [zone.id], depth: 0, parent_id: null });
    expect(rows.get(room.id)).toMatchObject({ path: [zone.id, room.id], depth: 1 });
  });

  it('should reject re-parenting under the area itself or its descendant with area_cycle, changing nothing (Review Focus 1)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const tree = await createTree(a, f.id);
    const before = await areasById(a, f.id);

    const e1 = await expectError(a.request(MOVE_AREA, { id: tree.floor1.id, parent: tree.room.id }));
    expect(e1.message).toContain('area_cycle');
    const e2 = await expectError(a.request(MOVE_AREA, { id: tree.building.id, parent: tree.zone.id }));
    expect(e2.message).toContain('area_cycle');
    const e3 = await expectError(a.request(MOVE_AREA, { id: tree.zone.id, parent: tree.zone.id }));
    expect(e3.message).toContain('area_cycle');
    expect(await areasById(a, f.id)).toEqual(before);
  });

  it('should reject a cycle formed by several rows of one statement, changing nothing', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const tree = await createTree(a, f.id);
    const before = await areasById(a, f.id);
    // floor1 -> under floor2 and floor2 -> under floor1 in one UPDATE.
    await expect(
      runSql(
        `update itap.areas set parent_id = case id when '${tree.floor1.id}' then '${tree.floor2.id}'::uuid else '${tree.floor1.id}'::uuid end
         where id in ('${tree.floor1.id}', '${tree.floor2.id}');`,
      ),
    ).rejects.toThrow(/area_cycle/);
    expect(await areasById(a, f.id)).toEqual(before);
  });

  it('should never form a cycle from two concurrent opposite moves', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    for (let i = 0; i < 5; i += 1) {
      const x = await createArea(a, f.id, `X${i}`);
      const y = await createArea(a, f.id, `Y${i}`);
      const results = await Promise.allSettled([
        a.request(MOVE_AREA, { id: x.id, parent: y.id }),
        a.request(MOVE_AREA, { id: y.id, parent: x.id }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rows = await areasById(a, f.id);
      const [rx, ry] = [rows.get(x.id), rows.get(y.id)];
      expect(rx?.parent_id === y.id && ry?.parent_id === x.id).toBe(false);
      for (const r of [rx, ry]) expect(r?.path[r.path.length - 1]).toBe(r?.id);
    }
  });

  it('should audit a move once on the moved area and not on the rewritten descendants', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const { floor2, zone, room } = await createTree(a, f.id);
    await a.request(MOVE_AREA, { id: zone.id, parent: floor2.id });
    const audit = await a.request<{ audit_log: { entity_id: string; action: string; changes: Record<string, unknown> }[] }>(
      `query($ids: [uuid!]!) { audit_log(where: { entity: { _eq: "areas" }, entity_id: { _in: $ids } }) { entity_id action changes } }`,
      { ids: [zone.id, room.id] },
    );
    const updates = audit.audit_log.filter((r) => r.action === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].entity_id).toBe(zone.id);
    expect(Object.keys(updates[0].changes)).toEqual(['parent_id']);
  });

  it('should reject a parent from another facility of the same organization (Review Focus 2)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const foreignParent = await createArea(a, f2.id, 'Other building', null, { area_type: 'building' });
    const e1 = await expectError(createArea(a, f1.id, 'Orphan', foreignParent.id));
    expect(e1.message).toMatch(/foreign key/i);
    const local = await createArea(a, f1.id, 'Local');
    const e2 = await expectError(a.request(MOVE_AREA, { id: local.id, parent: foreignParent.id }));
    expect(e2.message).toMatch(/foreign key/i);
  });

  it('should keep path and depth read-only and facility_id insert-only', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const area = await createArea(a, f.id, 'A');
    await expectDenied(a.request(SET_PATH, { id: area.id }), 'path');
    await expectDenied(
      a.request(INSERT_AREA, { object: { facility_id: f.id, name: 'x', area_type: 'zone', depth: 5 } }),
      'depth',
    );
    await expectDenied(
      a.request(`mutation($id: uuid!, $f: uuid!) { update_areas_by_pk(pk_columns: { id: $id }, _set: { facility_id: $f }) { id } }`, {
        id: area.id,
        f: f.id,
      }),
      'facility_id',
    );
  });

  it('should validate shape, capacity and enums', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    await createArea(a, f.id, 'Dock geofence', null, {
      area_type: 'virtual_zone',
      shape: { type: 'Circle', center: [400, 300], radius: 50 },
      access_level: 'restricted',
      capacity: 10,
      loitering_threshold_seconds: 120,
    });
    await createArea(a, f.id, 'Polygon zone', null, { shape: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 50]]] } });
    await expectError(createArea(a, f.id, 'bad shape', null, { shape: { type: 'Circle', center: [1, 2], radius: -1 } }));
    await expectError(createArea(a, f.id, 'bad capacity', null, { capacity: -1 }));
    await expectError(createArea(a, f.id, 'bad loitering', null, { loitering_threshold_seconds: 0 }));
    await expectError(createArea(a, f.id, 'bad type', null, { area_type: 'moon_base' }));
    await expectError(createArea(a, f.id, 'bad level', null, { access_level: 'top_secret' }));
  });

  it('should block deleting an area that has children', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const { zone, room } = await createTree(a, f.id);
    expect((await expectError(a.request(DELETE_AREA, { id: zone.id }))).message).toMatch(/foreign key/i);
    await a.request(DELETE_AREA, { id: room.id });
    expect((await a.request<{ delete_areas_by_pk: { id: string } }>(DELETE_AREA, { id: zone.id })).delete_areas_by_pk.id).toBe(zone.id);
  });
});

describe('area_descendants', () => {
  it('should return the subtree (the area and its descendants), scoped to the session organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const { building, floor1, zone, room } = await createTree(a, f.id);

    const sub = await a.request<{ area_descendants: { id: string; depth: number; organization_id: string; area_type: string }[] }>(
      DESCENDANTS,
      { area: floor1.id },
    );
    expect(sub.area_descendants.map((r) => r.id)).toEqual([floor1.id, zone.id, room.id]);
    expect(sub.area_descendants.map((r) => r.depth)).toEqual([1, 2, 3]);
    expect(sub.area_descendants.every((r) => r.organization_id === orgA.id)).toBe(true);
    const whole = await a.request<{ area_descendants: unknown[] }>(DESCENDANTS, { area: building.id });
    expect(whole.area_descendants).toHaveLength(5);

    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ area_descendants: unknown[] }>(DESCENDANTS, { area: building.id })).area_descendants).toEqual([]);
    await expectDenied(b.request(`query { area_refs { id } }`), 'area_refs');
  });
});
