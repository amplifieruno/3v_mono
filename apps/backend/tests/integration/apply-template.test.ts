import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin, asUser } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';
import { createArea, createFacility } from './support/facilities.js';

const INSERT_TEMPLATE = `
  mutation InsertTemplate($object: facility_templates_insert_input!) {
    insert_facility_templates_one(object: $object) { id }
  }
`;
const APPLY = `
  mutation Apply($template: uuid!, $facility: uuid!, $parent: uuid) {
    apply_facility_template(args: { p_template: $template, p_facility: $facility, p_parent_area: $parent }) {
      id facility_id parent_id path depth name area_type access_level capacity organization_id
    }
  }
`;
const COUNT = `
  query Count($facility: uuid!) { areas_aggregate(where: { facility_id: { _eq: $facility } }) { aggregate { count } } }
`;

type Applied = {
  id: string;
  facility_id: string;
  parent_id: string | null;
  path: string[];
  depth: number;
  name: string;
  area_type: string;
  access_level: string;
  capacity: number | null;
  organization_id: string;
};

/** Office floor: Floor -> (Reception, Open Space -> Desk Zone, Server Room), plus a second root Parking. */
const STRUCTURE = [
  {
    name: 'Floor',
    area_type: 'floor',
    children: [
      { name: 'Reception', area_type: 'room', capacity: 10 },
      { name: 'Open Space', area_type: 'zone', capacity: 40.0, children: [{ name: 'Desk Zone', area_type: 'zone' }] },
      { name: 'Server Room', area_type: 'room', access_level: 'secure' },
    ],
  },
  { name: 'Parking', area_type: 'parking' },
];

async function createTemplate(client: HasuraClient, structure: unknown = STRUCTURE): Promise<string> {
  const data = await client.request<{ insert_facility_templates_one: { id: string } }>(INSERT_TEMPLATE, {
    object: { name: `Template ${Math.random().toString(36).slice(2, 10)}`, structure },
  });
  return data.insert_facility_templates_one.id;
}

async function apply(client: HasuraClient, template: string, facility: string, parent: string | null = null) {
  const data = await client.request<{ apply_facility_template: Applied[] }>(APPLY, { template, facility, parent });
  return data.apply_facility_template;
}

async function areaCount(client: HasuraClient, facility: string): Promise<number> {
  const data = await client.request<{ areas_aggregate: { aggregate: { count: number } } }>(COUNT, { facility });
  return data.areas_aggregate.aggregate.count;
}

describe('apply_facility_template', () => {
  it('should create the whole tree at the facility root and return the created areas in pre-order', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const rows = await apply(a, await createTemplate(a), f.id);

    expect(rows.map((r) => r.name)).toEqual(['Floor', 'Reception', 'Open Space', 'Desk Zone', 'Server Room', 'Parking']);
    const byName = new Map(rows.map((r) => [r.name, r]));
    const floor = byName.get('Floor') as Applied;
    const open = byName.get('Open Space') as Applied;
    expect(floor).toMatchObject({ parent_id: null, depth: 0, path: [floor.id], area_type: 'floor', access_level: 'public' });
    expect(byName.get('Reception')).toMatchObject({ parent_id: floor.id, depth: 1, capacity: 10, area_type: 'room' });
    expect(open).toMatchObject({ parent_id: floor.id, capacity: 40 });
    expect(byName.get('Desk Zone')).toMatchObject({ parent_id: open.id, depth: 2, path: [floor.id, open.id, byName.get('Desk Zone')?.id] });
    expect(byName.get('Server Room')).toMatchObject({ access_level: 'secure', capacity: null });
    expect(byName.get('Parking')).toMatchObject({ parent_id: null, depth: 0, area_type: 'parking' });
    expect(rows.every((r) => r.facility_id === f.id && r.organization_id === orgA.id)).toBe(true);
    expect(await areaCount(a, f.id)).toBe(6);
  });

  it('should attach the roots under a parent area of the facility and audit each area with the caller', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const building = await createArea(a, f.id, 'Building', null, { area_type: 'building' });
    const rows = await apply(a, await createTemplate(a), f.id, building.id);

    const roots = rows.filter((r) => r.depth === 1);
    expect(roots.map((r) => r.name)).toEqual(['Floor', 'Parking']);
    expect(roots.every((r) => r.parent_id === building.id && r.path[0] === building.id)).toBe(true);
    expect(Math.max(...rows.map((r) => r.depth))).toBe(3);

    const ids = rows.map((r) => `'${r.id}'`).join(',');
    const audit = await runSqlRows(
      `SELECT action, user_id FROM itap.audit_log WHERE entity = 'areas' AND entity_id IN (${ids})`,
    );
    expect(audit).toHaveLength(rows.length);
    expect(audit.every((row) => row.action === 'insert' && row.user_id === user.id)).toBe(true);
  });

  it('should allow names that collide with existing siblings (no unique constraint on area names)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const template = await createTemplate(a, [{ name: 'Floor', area_type: 'floor' }]);
    await apply(a, template, f.id);
    await apply(a, template, f.id);
    expect(await areaCount(a, f.id)).toBe(2);
  });

  it('should reject a parent area of another facility with parent_area_not_found, creating nothing', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f1 = await createFacility(a);
    const f2 = await createFacility(a);
    const other = await createArea(a, f2.id, 'Elsewhere');
    const e = await expectError(apply(a, await createTemplate(a), f1.id, other.id));
    expect(e.message).toContain('parent_area_not_found');
    expect(await areaCount(a, f1.id)).toBe(0);
  });

  it('should resolve the template, facility and parent inside the session organization only', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    const fa = await createFacility(a);
    const fb = await createFacility(b);
    const areaB = await createArea(b, fb.id, 'B root');
    const templateA = await createTemplate(a);
    const templateB = await createTemplate(b);

    expect((await expectError(apply(a, templateB, fa.id))).message).toContain('facility_template_not_found');
    expect((await expectError(apply(a, templateA, fb.id))).message).toContain('facility_not_found');
    expect((await expectError(apply(a, templateA, fa.id, areaB.id))).message).toContain('parent_area_not_found');
    expect(await areaCount(a, fa.id)).toBe(0);
    expect(await areaCount(b, fb.id)).toBe(1);
  });

  it('should not be callable by the base user role', async () => {
    const { user } = await createTwoOrgs();
    await expectDenied(
      asUser(user.id).request(APPLY, { template: crypto.randomUUID(), facility: crypto.randomUUID() }),
      'apply_facility_template',
    );
  });

  it('should roll back every area already created when a later node fails (atomic)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const f = await createFacility(a);
    const template = await createTemplate(a, [
      { name: 'Floor', area_type: 'floor', children: [{ name: 'Room', area_type: 'room' }] },
      { name: '__apply_template_fail__', area_type: 'zone' },
    ]);
    const session = JSON.stringify({ 'x-hasura-organization-id': orgA.id, 'x-hasura-user-id': user.id });
    // One run_sql transaction: a trigger visible only inside it fails the last node; the function call runs in a
    // sub-block (savepoint) and records the error; the trigger is dropped before commit.
    const [row] = await runSqlRows(`
      CREATE FUNCTION itap.test_fail_template_node() RETURNS trigger LANGUAGE plpgsql AS
        $f$ BEGIN RAISE EXCEPTION 'injected_failure'; END $f$;
      CREATE TRIGGER test_fail_template_node BEFORE INSERT ON itap.areas FOR EACH ROW
        WHEN (NEW.name = '__apply_template_fail__') EXECUTE FUNCTION itap.test_fail_template_node();
      CREATE TEMP TABLE apply_template_result (message text, created int) ON COMMIT DROP;
      DO $d$ BEGIN
        BEGIN
          PERFORM itap.apply_facility_template('${session}'::json, '${template}', '${f.id}', NULL);
          INSERT INTO apply_template_result VALUES ('no error', NULL);
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO apply_template_result VALUES (SQLERRM, NULL);
        END;
        UPDATE apply_template_result SET created = (SELECT count(*) FROM itap.areas WHERE facility_id = '${f.id}');
      END $d$;
      DROP TRIGGER test_fail_template_node ON itap.areas;
      DROP FUNCTION itap.test_fail_template_node();
      SELECT message, created FROM apply_template_result;
    `);
    expect(row).toEqual({ message: 'injected_failure', created: '0' });
    expect(await areaCount(a, f.id)).toBe(0);
  });
});
