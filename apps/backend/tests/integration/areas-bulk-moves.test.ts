import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { AREAS, createArea, createFacility } from './support/facilities.js';
import { runSql } from './support/sql.js';

const UPDATE_MANY = `
  mutation MoveMany($updates: [areas_updates!]!) { update_areas_many(updates: $updates) { affected_rows } }
`;

type Row = { id: string; parent_id: string | null; path: string[]; depth: number };

async function areasById(client: HasuraClient, facility: string): Promise<Map<string, Row>> {
  const data = await client.request<{ areas: Row[] }>(AREAS, { facility });
  return new Map(data.areas.map((r) => [r.id, r]));
}

async function setup(): Promise<{ a: HasuraClient; facility: string }> {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  return { a, facility: (await createFacility(a)).id };
}

/** One SQL statement re-parenting several rows: `moves` maps area id -> new parent id. */
function bulkMove(moves: Record<string, string>): Promise<void> {
  const cases = Object.entries(moves)
    .map(([id, parent]) => `when '${id}' then '${parent}'::uuid`)
    .join(' ');
  const ids = Object.keys(moves).map((id) => `'${id}'`).join(', ');
  return runSql(`update itap.areas set parent_id = case id ${cases} end where id in (${ids});`);
}

const move = (id: string, parent: string | null) => ({ where: { id: { _eq: id } }, _set: { parent_id: parent } });

describe('areas: several re-parents in one statement', () => {
  it('should reject moves to different parents in one statement (cycle A -> R2 -> C -> A), changing nothing', async () => {
    const { a, facility } = await setup();
    // Creation order as in the review probe (R2 last), so a sequential scan processes A before R2.
    const r1 = await createArea(a, facility, 'R1');
    const nodeA = await createArea(a, facility, 'A', r1.id);
    const c = await createArea(a, facility, 'C', nodeA.id);
    const r2 = await createArea(a, facility, 'R2');
    const before = await areasById(a, facility);
    await expect(bulkMove({ [nodeA.id]: r2.id, [r2.id]: c.id })).rejects.toThrow(/area_multi_parent_move|area_cycle/);
    expect(await areasById(a, facility)).toEqual(before);
  });

  it('should reject moves to different parents that would leave a stale path prefix (X under Z, Z under R2)', async () => {
    const { a, facility } = await setup();
    const r1 = await createArea(a, facility, 'R1');
    const r2 = await createArea(a, facility, 'R2');
    const z = await createArea(a, facility, 'Z', r1.id);
    const x = await createArea(a, facility, 'X');
    const before = await areasById(a, facility);
    await expect(bulkMove({ [x.id]: z.id, [z.id]: r2.id })).rejects.toThrow(/area_multi_parent_move/);
    expect(await areasById(a, facility)).toEqual(before);
  });

  it('should allow moving several areas under one parent, including an area together with its descendant', async () => {
    const { a, facility } = await setup();
    const p = await createArea(a, facility, 'P');
    const nodeA = await createArea(a, facility, 'A');
    const d = await createArea(a, facility, 'D', nodeA.id);
    const leaf = await createArea(a, facility, 'Leaf', d.id);
    const b = await createArea(a, facility, 'B');
    await bulkMove({ [nodeA.id]: p.id, [d.id]: p.id, [b.id]: p.id });
    const rows = await areasById(a, facility);
    expect(rows.get(nodeA.id)).toMatchObject({ path: [p.id, nodeA.id], depth: 1 });
    expect(rows.get(d.id)).toMatchObject({ path: [p.id, d.id], depth: 1 });
    expect(rows.get(leaf.id)).toMatchObject({ path: [p.id, d.id, leaf.id], depth: 2 });
    expect(rows.get(b.id)).toMatchObject({ path: [p.id, b.id], depth: 1 });
  });
});

describe('areas: update_areas_many (one statement per entry)', () => {
  it('should apply moves to different parents in order with correct paths', async () => {
    const { a, facility } = await setup();
    const r1 = await createArea(a, facility, 'R1');
    const r2 = await createArea(a, facility, 'R2');
    const z = await createArea(a, facility, 'Z', r1.id);
    const x = await createArea(a, facility, 'X');
    const child = await createArea(a, facility, 'Child', x.id);
    await a.request(UPDATE_MANY, { updates: [move(x.id, z.id), move(z.id, r2.id)] });
    const rows = await areasById(a, facility);
    expect(rows.get(z.id)).toMatchObject({ path: [r2.id, z.id], depth: 1 });
    expect(rows.get(x.id)).toMatchObject({ path: [r2.id, z.id, x.id], depth: 2 });
    expect(rows.get(child.id)).toMatchObject({ path: [r2.id, z.id, x.id, child.id], depth: 3 });
  });

  it('should reject the A -> R2 -> C -> A cycle with area_cycle and roll back every entry', async () => {
    const { a, facility } = await setup();
    const r1 = await createArea(a, facility, 'R1');
    const r2 = await createArea(a, facility, 'R2');
    const nodeA = await createArea(a, facility, 'A', r1.id);
    const c = await createArea(a, facility, 'C', nodeA.id);
    const before = await areasById(a, facility);
    const err = await expectError(a.request(UPDATE_MANY, { updates: [move(nodeA.id, r2.id), move(r2.id, c.id)] }));
    expect(err.message).toContain('area_cycle');
    expect(await areasById(a, facility)).toEqual(before);
  });
});
