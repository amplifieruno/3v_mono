import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { setRestriction } from './support/compliance.js';
import { fileDsr, settledDsr } from './support/dsr.js';
import { createTwoOrgs } from './support/fixtures.js';
import { createIntegration, syncedProfiles, syncNow, uploadFixture } from './support/integrations.js';
import { count } from './support/retention.js';
import { runSqlRows } from './support/sql.js';

/** Integrations fix round 1 (slice 10 task 4): erased-person suppression, restriction, value normalisation. */

async function world() {
  const { orgA, user } = await createTwoOrgs();
  return { org: orgA.id, a: asOrgAdmin(user.id, orgA.id) };
}

const MAPPING = { given: 'first_name', family: 'last_name', start: 'start_date' };

async function hr(w: Awaited<ReturnType<typeof world>>, records: unknown[]) {
  const fixture = await uploadFixture(w.org, JSON.stringify(records));
  return createIntegration(w.a, { kind: 'hr', config: { fixture_file_id: fixture, external_id_field: 'emp' }, field_mapping: MAPPING });
}

async function profileOf(org: string, integration: string, externalId: string): Promise<string> {
  const [row] = await runSqlRows(
    `select id from itap.profiles where organization_id = '${org}' and source_integration_id = '${integration}' and external_id = '${externalId}'`,
  );
  return String(row.id);
}

describe('HR sync and erased people', () => {
  it('should never recreate an erased person (suppression key without the identifier itself)', async () => {
    const w = await world();
    const integration = await hr(w, [{ emp: 'E1', given: 'Ann', family: 'Gone' }, { emp: 'E2', given: 'Bob', family: 'Stays' }]);
    expect(await syncNow(w.a, integration.id)).toMatchObject({ created_count: 2 });
    const ann = await profileOf(w.org, integration.id, 'E1');
    expect(await settledDsr((await fileDsr(w.a, ann, 'erasure')).id)).toMatchObject({ status: 'completed' });

    const again = await syncNow(w.a, integration.id);
    expect(again).toMatchObject({ status: 'succeeded', created_count: 0, updated_count: 0, skipped_suppressed: 1 });
    expect((await syncedProfiles(w.org, integration.id)).map((p) => p.external_id)).toEqual(['E2']);
    expect(await count(`itap.profiles where organization_id = '${w.org}' and first_name = 'Ann'`)).toBe(0);
    // The suppression list holds a key, never the external id.
    const [s] = await runSqlRows(`select key_hash, row_to_json(x)::text as row from itap.integration_suppressions x where integration_id = '${integration.id}'`);
    expect(String(s.key_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(s.row)).not.toContain('E1');
  });
});

describe('HR sync and restricted people', () => {
  it('should neither update nor deactivate a profile whose processing is restricted', async () => {
    const w = await world();
    const integration = await hr(w, [{ emp: 'E1', given: 'Ann', family: 'Lee' }]);
    await syncNow(w.a, integration.id);
    const ann = await profileOf(w.org, integration.id, 'E1');
    await setRestriction(w.a, ann, true);
    const fixture = await uploadFixture(w.org, JSON.stringify([{ emp: 'E1', given: 'Anna', family: 'Lee' }]));
    await w.a.request(`mutation($id: uuid!, $c: jsonb!) { update_integrations_by_pk(pk_columns: {id: $id}, _set: {config: $c}) { id } }`, {
      id: integration.id,
      c: { fixture_file_id: fixture, external_id_field: 'emp' },
    });
    expect(await syncNow(w.a, integration.id)).toMatchObject({ updated_count: 0, skipped_restricted: 1 });
    const empty = await uploadFixture(w.org, '[]');
    await w.a.request(`mutation($id: uuid!, $c: jsonb!) { update_integrations_by_pk(pk_columns: {id: $id}, _set: {config: $c}) { id } }`, {
      id: integration.id,
      c: { fixture_file_id: empty, external_id_field: 'emp' },
    });
    expect(await syncNow(w.a, integration.id)).toMatchObject({ deactivated_count: 0, skipped_restricted: 1 });
    expect(await syncedProfiles(w.org, integration.id)).toMatchObject([{ first_name: 'Ann', status: 'active' }]);
  });
});

describe('HR value normalisation', () => {
  it('should compare dates in canonical form so an unchanged person is not rewritten', async () => {
    const w = await world();
    const integration = await hr(w, [{ emp: 'E1', given: 'Ann', family: 'Lee', start: '2024-01-05T00:00:00Z' }]);
    expect(await syncNow(w.a, integration.id)).toMatchObject({ created_count: 1 });
    const [row] = await runSqlRows(`select start_date::text as d from itap.profiles where source_integration_id = '${integration.id}'`);
    expect(row.d).toBe('2024-01-05');
    expect(await syncNow(w.a, integration.id)).toMatchObject({ updated_count: 0, records_out: 0 });
  });
});
