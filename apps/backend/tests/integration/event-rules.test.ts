import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createArea, createFacility } from './support/facilities.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import {
  callFn,
  createRuleWithDraft,
  deleteByPk,
  insertOne,
  updateByPk,
  VERSION_FIELDS,
  type Version,
} from './support/operations.js';
import { runSqlRows } from './support/sql.js';

const RULE = `query($id: uuid!) { event_rules_by_pk(id: $id) { code current_version_id current_version { id version }
  event_rule_versions(order_by: {version: asc}) { id version status event_rule_version_scopes { facility_id area_id segment_id } } } }`;
type RuleView = {
  code: string;
  current_version_id: string | null;
  current_version: { id: string; version: number } | null;
  event_rule_versions: {
    id: string;
    version: number;
    status: string;
    event_rule_version_scopes: { facility_id: string | null; area_id: string | null; segment_id: string | null }[];
  }[];
};

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const area = await createArea(a, facility.id, 'Server room');
  return { orgA, orgB, user, other, a, facility, area };
}

async function ruleView(client: ReturnType<typeof asOrgAdmin>, id: string): Promise<RuleView> {
  return (await client.request<{ event_rules_by_pk: RuleView }>(RULE, { id })).event_rules_by_pk;
}

const publish = (client: ReturnType<typeof asOrgAdmin>, versionId: string): Promise<Version> =>
  callFn<Version>(client, 'publish_event_rule_version', { p_version: versionId }, VERSION_FIELDS);
const createDraft = (client: ReturnType<typeof asOrgAdmin>, ruleId: string): Promise<Version> =>
  callFn<Version>(client, 'create_event_rule_draft', { p_rule: ruleId }, VERSION_FIELDS);

describe('event rules (versioned)', () => {
  it('should number rules RULE-xxxxx and versions per rule, starting as a draft without a current version', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    expect(rule.code).toMatch(/^RULE-\d{5}$/);
    expect(draft).toMatchObject({ version: 1, status: 'draft', severity: 'high', creates_incident: true });
    const view = await ruleView(s.a, rule.id);
    expect(view.current_version_id).toBeNull();
    expect(view.event_rule_versions[0].event_rule_version_scopes).toEqual([
      { facility_id: s.facility.id, area_id: null, segment_id: null },
    ]);
  });

  it('should publish a draft: header points at it, published_by/at set, audit row publish', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    const published = await publish(s.a, draft.id);
    expect(published).toMatchObject({ id: draft.id, status: 'published', published_by: s.user.id });
    expect(published.published_at).not.toBeNull();
    const view = await ruleView(s.a, rule.id);
    expect(view.current_version).toEqual({ id: draft.id, version: 1 });
    const audit = await runSqlRows(
      `select user_id from itap.audit_log where entity = 'event_rule_versions' and entity_id = '${draft.id}' and action = 'publish'`,
    );
    expect(audit).toEqual([{ user_id: s.user.id }]);
    const again = await expectError(publish(s.a, draft.id));
    expect(again.message).toContain('version_already_published');
  });

  it('should freeze published versions and their scopes', async () => {
    const s = await setup();
    const { draft } = await createRuleWithDraft(s.a, s.facility.id);
    await publish(s.a, draft.id);
    const edit = await expectError(updateByPk(s.a, 'event_rule_versions', draft.id, { severity: 'low' }));
    expect(edit.message).toContain('version_not_editable');
    const scope = await expectError(insertOne(s.a, 'event_rule_version_scopes', { version_id: draft.id, area_id: s.area.id }));
    expect(scope.message).toContain('version_not_editable');
    const [row] = await runSqlRows(`select id from itap.event_rule_version_scopes where version_id = '${draft.id}'`);
    const del = await expectError(deleteByPk(s.a, 'event_rule_version_scopes', row.id ?? ''));
    expect(del.message).toContain('version_not_editable');
    // Status published/superseded is reserved for the publish function.
    const status = await expectError(updateByPk(s.a, 'event_rule_versions', draft.id, { status: 'draft' }));
    expect(status.message).toContain('version_status_reserved');
  });

  it('should reject org_admin writes of the reserved statuses published and superseded', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    for (const status of ['published', 'superseded']) {
      const update = await expectError(updateByPk(s.a, 'event_rule_versions', draft.id, { status }));
      expect(update.message).toContain('version_status_reserved');
    }
    await publish(s.a, draft.id);
    const insert = await expectError(insertOne(s.a, 'event_rule_versions', { rule_id: rule.id, status: 'published' }));
    expect(insert.message).toContain('version_status_reserved');
    const view = await ruleView(s.a, rule.id);
    expect(view.event_rule_versions.map((v) => v.status)).toEqual(['published']);
  });

  it('should create a new draft copying the current version and its scopes, idempotently', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    await insertOne(s.a, 'event_rule_version_scopes', { version_id: draft.id, area_id: s.area.id });
    await publish(s.a, draft.id);
    const v2 = await createDraft(s.a, rule.id);
    expect(v2).toMatchObject({
      version: 2,
      status: 'draft',
      severity: 'high',
      creates_incident: true,
      parameters: { grace_minutes: 5 },
      published_by: null,
    });
    expect((await createDraft(s.a, rule.id)).id).toBe(v2.id);
    await updateByPk(s.a, 'event_rule_versions', v2.id, { severity: 'critical', parameters: { grace_minutes: 10 } });
    const view = await ruleView(s.a, rule.id);
    const scopes = view.event_rule_versions.map((v) =>
      v.event_rule_version_scopes.map((x) => x.facility_id ?? x.area_id).sort(),
    );
    expect(scopes[0]).toEqual(scopes[1]);
    expect(scopes[1]).toHaveLength(2);
    // Only one open draft per rule.
    const second = await expectError(insertOne(s.a, 'event_rule_versions', { rule_id: rule.id }));
    expect(second.message).toMatch(/event_rule_versions_one_open_key|unique|Uniqueness/i);
  });

  it('should supersede the previous version on publish and allow rollback to it', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    await publish(s.a, draft.id);
    const v2 = await createDraft(s.a, rule.id);
    await publish(s.a, v2.id);
    let view = await ruleView(s.a, rule.id);
    expect(view.event_rule_versions.map((v) => v.status)).toEqual(['superseded', 'published']);
    expect(view.current_version_id).toBe(v2.id);
    // Rollback = publish the earlier version.
    await publish(s.a, draft.id);
    view = await ruleView(s.a, rule.id);
    expect(view.event_rule_versions.map((v) => v.status)).toEqual(['published', 'superseded']);
    expect(view.current_version_id).toBe(draft.id);
  });

  it('should allow pending_approval, delete only open versions and keep the header current_version_id read-only', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    await updateByPk(s.a, 'event_rule_versions', draft.id, { status: 'pending_approval' });
    await publish(s.a, draft.id);
    await expectDenied(
      s.a.request(`mutation($id: uuid!) { update_event_rules_by_pk(pk_columns: {id: $id}, _set: {current_version_id: null}) { id } }`, {
        id: rule.id,
      }),
      'current_version_id',
    );
    expect(await deleteByPk(s.a, 'event_rule_versions', draft.id)).toBeNull();
    const v2 = await createDraft(s.a, rule.id);
    expect(await deleteByPk(s.a, 'event_rule_versions', v2.id)).toEqual({ id: v2.id });
    // The whole rule can be deleted (its versions and scopes go with it).
    await s.a.request(`mutation($id: uuid!) { delete_event_rules_by_pk(id: $id) { id } }`, { id: rule.id });
    expect(await runSqlRows(`select id from itap.event_rule_versions where rule_id = '${rule.id}'`)).toEqual([]);
  });

  it('should require exactly one scope target and keep everything inside the organization', async () => {
    const s = await setup();
    const { rule, draft } = await createRuleWithDraft(s.a, s.facility.id);
    const both = await expectError(
      insertOne(s.a, 'event_rule_version_scopes', { version_id: draft.id, facility_id: s.facility.id, area_id: s.area.id }),
    );
    expect(both.message).toContain('event_rule_version_scopes_exactly_one_target');
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    const notFound = await expectError(publish(b, draft.id));
    expect(notFound.message).toContain('event_rule_version_not_found');
    const noRule = await expectError(createDraft(b, rule.id));
    expect(noRule.message).toContain('event_rule_not_found');
    const foreign = await b.request<{ event_rules: unknown[]; event_rule_versions: unknown[] }>(
      `query { event_rules { id } event_rule_versions { id } }`,
    );
    expect(foreign).toEqual({ event_rules: [], event_rule_versions: [] });
    // Admin (no session) cannot call the functions without an organization.
    const noOrg = await expectError(
      asAdmin().request(`mutation($v: uuid!) { publish_event_rule_version(args: {p_version: $v}) { id } }`, { v: draft.id }),
    );
    expect(`${noOrg.message} ${noOrg.detail ?? ''}`).toContain('organization_required');
  });
});

describe('severity_rank', () => {
  it('should order the severity scale and return null for unknown values', async () => {
    const rows = await runSqlRows(
      `select itap.severity_rank(v) as r from unnest(array['info','low','medium','high','critical','bogus']) v`,
    );
    expect(rows.map((r) => r.r)).toEqual(['1', '2', '3', '4', '5', 'NULL']);
  });
});
