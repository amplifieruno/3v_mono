import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestOrg } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

const DROP = 'DROP TABLE IF EXISTS itap.numbering_scratch;';

function insertSql(orgId: string, sleep = 0): string {
  return `INSERT INTO itap.numbering_scratch (organization_id) VALUES ('${orgId}');
    ${sleep ? `SELECT pg_sleep(${sleep});` : ''}`;
}

async function numbers(orgId: string): Promise<number[]> {
  const rows = await runSqlRows(`SELECT number FROM itap.numbering_scratch WHERE organization_id = '${orgId}' ORDER BY number;`);
  return rows.map((r) => Number(r.number));
}

describe('itap.assign_number', () => {
  beforeAll(async () => {
    await runSql(`${DROP}
      CREATE TABLE itap.numbering_scratch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        number bigint,
        UNIQUE (organization_id, number)
      );
      CREATE TRIGGER number BEFORE INSERT ON itap.numbering_scratch
        FOR EACH ROW EXECUTE FUNCTION itap.assign_number('scratch');`);
  });
  afterAll(async () => {
    await runSql(DROP);
  });

  it('should give concurrent inserts in one org distinct consecutive numbers and start another org at 1', async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    // Each insert holds its transaction open so the counter row lock is really contended.
    await Promise.all([1, 2, 3, 4, 5].map(() => runSql(insertSql(orgA.id, 0.2))));
    expect(await numbers(orgA.id)).toEqual([1, 2, 3, 4, 5]);

    await runSql(insertSql(orgB.id));
    expect(await numbers(orgB.id)).toEqual([1]);
    await runSql(insertSql(orgA.id));
    expect(await numbers(orgA.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should keep an explicitly provided number and not advance the counter', async () => {
    const org = await createTestOrg();
    await runSql(`INSERT INTO itap.numbering_scratch (organization_id, number) VALUES ('${org.id}', 500);`);
    await runSql(insertSql(org.id));
    expect(await numbers(org.id)).toEqual([1, 500]);
  });

  it('should use independent sequences per entity key', async () => {
    const org = await createTestOrg();
    await runSql(`DROP TABLE IF EXISTS itap.numbering_scratch2;
      CREATE TABLE itap.numbering_scratch2 (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, number bigint);
      CREATE TRIGGER number BEFORE INSERT ON itap.numbering_scratch2 FOR EACH ROW EXECUTE FUNCTION itap.assign_number('scratch2');
      INSERT INTO itap.numbering_scratch2 (organization_id) VALUES ('${org.id}');
      INSERT INTO itap.numbering_scratch (organization_id) VALUES ('${org.id}');
      INSERT INTO itap.numbering_scratch (organization_id) VALUES ('${org.id}');`);
    const rows = await runSqlRows(`SELECT number FROM itap.numbering_scratch2 WHERE organization_id = '${org.id}';`);
    await runSql('DROP TABLE itap.numbering_scratch2;');
    expect(rows.map((r) => r.number)).toEqual(['1']);
    expect(await numbers(org.id)).toEqual([1, 2]);
  });

  it('should reject a row without an organization and a trigger without an entity key', async () => {
    await expect(runSql(`INSERT INTO itap.numbering_scratch (organization_id) VALUES (null);`)).rejects.toThrow();
    await runSql(`DROP TABLE IF EXISTS itap.numbering_scratch3;
      CREATE TABLE itap.numbering_scratch3 (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, number bigint);
      CREATE TRIGGER number BEFORE INSERT ON itap.numbering_scratch3 FOR EACH ROW EXECUTE FUNCTION itap.assign_number();`);
    const org = await createTestOrg();
    const attempt = runSql(`INSERT INTO itap.numbering_scratch3 (organization_id) VALUES ('${org.id}');`);
    await expect(attempt).rejects.toThrow(/entity/);
    await runSql('DROP TABLE itap.numbering_scratch3;');
  });

  it('should delete counters with the organization', async () => {
    const org = await createTestOrg();
    await runSql(insertSql(org.id));
    const before = await runSqlRows(`SELECT count(*) AS n FROM itap.organization_counters WHERE organization_id = '${org.id}';`);
    expect(before[0].n).toBe('1');
    await runSql(`DELETE FROM itap.organizations WHERE id = '${org.id}';`);
    const after = await runSqlRows(`SELECT count(*) AS n FROM itap.organization_counters WHERE organization_id = '${org.id}';`);
    expect(after[0].n).toBe('0');
  });
});
