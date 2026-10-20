import { describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { axis, vectorLiteral } from './support/faces.js';
import { createTwoOrgs } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';

const search = async (org: string, embedding: number[] | null): Promise<string[]> =>
  (
    await runSqlRows(
      `select identity_id from itap.search_identities('${org}', ${embedding ? `'${vectorLiteral(embedding)}'` : 'null'}, 0.5, 20, '{}'::jsonb)`,
    )
  ).map((r) => String(r.identity_id));

describe('search_identities: synthetic identities', () => {
  it('should never return sandbox (synthetic) identities in facial or attribute search', async () => {
    const { orgA } = await createTwoOrgs();
    const synthetic = await faceIdentity(orgA.id, [axis(50)], { synthetic: true });
    const production = await faceIdentity(orgA.id, [axis(51)]);
    expect(await search(orgA.id, axis(50))).toEqual([]);
    expect(await search(orgA.id, axis(51))).toEqual([production]);
    const listed = await search(orgA.id, null);
    expect(listed).toContain(production);
    expect(listed).not.toContain(synthetic);
  });
});
