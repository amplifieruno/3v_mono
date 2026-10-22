import { type DataProvider, type MutationContext, createMutationDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateParameters } from '../../src/fields/event-rule-parameters-format';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Versioned event rules against the dev stack (Nova, `org_admin`), on a rule the test creates
 * and deletes: "Edit draft" answers one draft however often it is asked, the draft is edited
 * (parameters by rule type, scope), published, and a second publish of it is refused clearly
 * (Review Focus 2); a second open version beside the draft is refused by the database; the next
 * draft copies the scope; a published version's scope is frozen; rolling back puts the earlier
 * version in force again. The computed fields the console reads (a version's rule type, an
 * incident's rule) answer as the console expects.
 */

const SESSION = {
  providerId: 'hasura',
  sessionKey: 'event-rules-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

type Row = Record<string, unknown>;

interface VersionRow {
  readonly id: string;
  readonly version: number;
  readonly status: string;
}

describe.skipIf(!DEV_STACK_ENABLED)('event rules against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let ruleId = '';

  const mutate = async (operation: string, input: Row): Promise<VersionRow> => {
    const descriptor = {
      ...SESSION,
      kind: 'custom',
      ref: { namespace: 'default', id: operation },
      resource: MONITORING_BINDING,
      operation,
      input,
    };
    return (await provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context())) as VersionRow;
  };

  const send = async (query: string, variables: Row = {}): Promise<{ data?: Row; errors?: { message: string }[] }> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as { data?: Row; errors?: { message: string }[] };
  };

  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await send(query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  const versionById = async (id: string): Promise<Row> =>
    (
      await graphql(
        'query ($id: uuid!) { event_rule_versions_by_pk(id: $id) { id version status rule_type parameters event_rule_version_scopes { area_id } } }',
        { id },
      )
    ).event_rule_versions_by_pk as Row;

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const data = await graphql(
      `mutation ($name: String!) {
        insert_event_rules_one(object: { name: $name, rule_type: unusual_dwell, is_enabled: false }) { id }
      }`,
      { name: `Dev test rule ${crypto.randomUUID()}` },
    );
    ruleId = String((data.insert_event_rules_one as Row).id);
  }, 60_000);

  afterAll(async () => {
    if (ruleId !== '') await graphql('mutation ($id: uuid!) { delete_event_rules_by_pk(id: $id) { id } }', { id: ruleId });
  }, 60_000);

  it('should draft, edit, publish and roll back a rule, refusing what history forbids', async () => {
    const areas = (await graphql('{ areas(limit: 2, order_by: { name: asc }) { id } }')).areas as Row[];
    const areaId = String(areas[0]?.id);
    const otherAreaId = String(areas[1]?.id);

    // "Edit draft" twice: one draft (the function is idempotent), empty for a new rule.
    const first = await mutate('createEventRuleDraft', { ruleId });
    expect(first).toMatchObject({ version: 1, status: 'draft' });
    expect((await mutate('createEventRuleDraft', { ruleId })).id).toBe(first.id);
    const draft = await versionById(first.id);
    expect(draft.rule_type).toBe('unusual_dwell');
    expect(validateParameters(draft.parameters, draft.rule_type)?.code).toBe('ruleParameters.dwellRequired');

    // Edit the draft as a record: parameters by rule type, then one area of scope.
    await graphql(
      'mutation ($id: uuid!) { update_event_rule_versions_by_pk(pk_columns: { id: $id }, _set: { parameters: { dwell_seconds: 900 }, severity: high }) { id } }',
      { id: first.id },
    );
    await graphql('mutation ($v: uuid!, $a: uuid!) { insert_event_rule_version_scopes_one(object: { version_id: $v, area_id: $a }) { id } }', {
      v: first.id,
      a: areaId,
    });

    // A second open version beside the draft is refused by the database (one open version per rule).
    const second = await send(
      'mutation ($r: uuid!) { insert_event_rule_versions_one(object: { rule_id: $r }) { id } }',
      { r: ruleId },
    );
    expect(second.errors?.[0]?.message).toContain('event_rule_versions_one_open_key');

    // Publish puts it in force; publishing it again is a definite, clear refusal (Review Focus 2).
    expect(await mutate('publishEventRuleVersion', { versionId: first.id })).toMatchObject({ status: 'published' });
    const rule = (await graphql('query ($id: uuid!) { event_rules_by_pk(id: $id) { current_version_id } }', { id: ruleId }))
      .event_rules_by_pk as Row;
    expect(rule.current_version_id).toBe(first.id);
    await expect(mutate('publishEventRuleVersion', { versionId: first.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'version_already_published',
    });

    // The published version is frozen: no edit of its columns, no change of its scope.
    const frozen = await send(
      'mutation ($v: uuid!, $a: uuid!) { insert_event_rule_version_scopes_one(object: { version_id: $v, area_id: $a }) { id } }',
      { v: first.id, a: otherAreaId },
    );
    expect(frozen.errors?.[0]?.message).toContain('version_not_editable');

    // The next draft copies parameters and scope from the version in force.
    const next = await mutate('createEventRuleDraft', { ruleId });
    expect(next).toMatchObject({ version: 2, status: 'draft' });
    expect(await versionById(next.id)).toMatchObject({
      parameters: { dwell_seconds: 900 },
      event_rule_version_scopes: [{ area_id: areaId }],
    });

    // Publish version 2, then roll back to version 1.
    await mutate('publishEventRuleVersion', { versionId: next.id });
    expect((await versionById(first.id)).status).toBe('superseded');
    expect(await mutate('publishEventRuleVersion', { versionId: first.id })).toMatchObject({ status: 'published' });
    expect((await versionById(next.id)).status).toBe('superseded');

    // A version that no longer exists is a definite refusal too.
    await expect(mutate('publishEventRuleVersion', { versionId: crypto.randomUUID() })).rejects.toMatchObject({
      kind: 'validation',
      code: 'event_rule_version_not_found',
    });
  }, 120_000);

  it('should name the rule that opened each seeded rule incident', async () => {
    const data = await graphql(
      '{ incidents(where: { rule_id: { _is_null: false } }, limit: 20) { rule_id dedup_key } event_rules { id } }',
    );
    const incidents = data.incidents as Row[];
    expect(incidents.length).toBeGreaterThan(0);
    const rules = new Set((data.event_rules as Row[]).map((r) => r.id));
    for (const incident of incidents) {
      expect(rules.has(incident.rule_id)).toBe(true);
      expect(String(incident.dedup_key)).toContain(`:rule:${String(incident.rule_id)}`);
    }
  }, 60_000);
});
