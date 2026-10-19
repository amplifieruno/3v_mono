import { describe, expect, it } from 'vitest';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';

describe('decide_verification flag handling', () => {
  it.each(['on', 'off'])('should restore the previous verification_context (%s) after approving', async (previous) => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const session = JSON.stringify({ 'x-hasura-user-id': user.id, 'x-hasura-organization-id': orgA.id });
    // run_sql executes the batch in one transaction, so the transaction-local flag is observable at the end.
    const rows = await runSqlRows(`
      insert into itap.verification_requests (organization_id, identity_id)
        values ('${orgA.id}', '${identity.id}');
      select set_config('itap.verification_context', '${previous}', true);
      select * from itap.decide_verification('${session}'::json,
        (select id from itap.verification_requests where identity_id = '${identity.id}'), null, 'approved');
      select current_setting('itap.verification_context', true) as flag;
    `);
    expect(rows[0]?.flag).toBe(previous);
  });
});
