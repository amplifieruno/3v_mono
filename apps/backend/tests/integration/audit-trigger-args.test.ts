import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asAdmin } from './support/clients.js';
import { runSql } from './support/sql.js';
import { createTestOrg } from './support/fixtures.js';

type AuditRow = { action: string; entity_id: string; changes: Record<string, unknown> };

const DROP = 'DROP TABLE IF EXISTS itap.audit_scratch;';
const AUDIT = `
  query Audit($orgId: uuid!, $entityId: uuid!) {
    audit_log(where: { organization_id: { _eq: $orgId }, entity: { _eq: "audit_scratch" }, entity_id: { _eq: $entityId } }, order_by: { occurred_at: asc }) {
      action entity_id changes
    }
  }
`;

async function audit(orgId: string, id: string): Promise<AuditRow[]> {
  const data = await asAdmin().request<{ audit_log: AuditRow[] }>(AUDIT, { orgId, entityId: id });
  return data.audit_log;
}

describe('audit_row_change arguments', () => {
  beforeAll(async () => {
    await runSql(`${DROP}
      CREATE TABLE itap.audit_scratch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        secret text, sys_counter int, name text,
        updated_at timestamptz
      );
      CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.audit_scratch
        FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret', 'ignore:sys_counter');`);
  });
  afterAll(async () => {
    await runSql(DROP);
  });

  it('should redact plain columns and skip ignore: columns', async () => {
    const org = await createTestOrg();
    const id = randomUUID();
    await runSql(
      `INSERT INTO itap.audit_scratch (id, organization_id, secret, sys_counter, name)
       VALUES ('${id}', '${org.id}', 'hunter2', 1, 'a');`,
    );
    let rows = await audit(org.id, id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('insert');
    expect(rows[0].changes).toMatchObject({ secret: '[redacted]', name: 'a' });

    await runSql(`UPDATE itap.audit_scratch SET name = 'b', secret = 'other' WHERE id = '${id}';`);
    rows = await audit(org.id, id);
    expect(rows).toHaveLength(2);
    expect(rows[1].changes).toEqual({
      name: { old: 'a', new: 'b' },
      secret: { old: '[redacted]', new: '[redacted]' },
    });

    await runSql(`UPDATE itap.audit_scratch SET sys_counter = 99 WHERE id = '${id}';`);
    expect(await audit(org.id, id)).toHaveLength(2);

    await runSql(`DELETE FROM itap.audit_scratch WHERE id = '${id}';`);
    rows = await audit(org.id, id);
    expect(rows).toHaveLength(3);
    expect(rows[2].action).toBe('delete');
    expect(rows[2].changes).toMatchObject({ secret: '[redacted]', name: 'b' });
  });
});
