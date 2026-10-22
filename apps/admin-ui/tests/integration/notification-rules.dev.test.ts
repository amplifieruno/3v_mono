import { type DataProvider, type QueryContext, createQueryDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { NOTIFICATIONS_BINDING, testRow } from '../../src/blocks/notification-rule-test/notification-rule-test-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateConditions } from '../../src/fields/notification-conditions-format';
import { NOTIFICATION_CONDITIONS_BINDING, conditionReferences } from '../../src/fields/notification-conditions-query';
import { placeholderProblem } from '../../src/modules/notifications/notification-template-fields';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Notification rules against the dev stack (Nova, `org_admin`), on a rule and a template the test
 * creates and deletes. "Test rule" (Review Focus 1): `test_notification_rule` answers which of
 * the latest events would match and to whom, and writes nothing (the organization's deliveries
 * and the rule's last trigger are unchanged). The conditions the editor builds from the
 * organization's records are accepted, and what the console refuses the database refuses too.
 */

const SESSION = { providerId: 'hasura', sessionKey: 'notification-rules-dev-test', scopeKey: null, bindingRevision: '1' } as const;

function context(): QueryContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
  } as QueryContext;
}

type Row = Record<string, unknown>;

describe.skipIf(!DEV_STACK_ENABLED)('notification rules against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let ruleId = '';
  let templateId = '';

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

  const custom = async (resource: string, operation: string, input: Row): Promise<unknown> =>
    provider.queries?.custom?.(
      createQueryDescriptor({
        ...SESSION,
        kind: 'custom',
        ref: { namespace: 'default', id: operation },
        resource,
        operation,
        input,
      } as never) as never,
      context(),
    );

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  }, 60_000);

  afterAll(async () => {
    if (ruleId !== '') await graphql('mutation ($id: uuid!) { delete_notification_rules_by_pk(id: $id) { id } }', { id: ruleId });
    if (templateId !== '') await graphql('mutation ($id: uuid!) { delete_notification_templates_by_pk(id: $id) { id } }', { id: templateId });
  }, 60_000);

  it('should test a rule against the latest events without writing anything (Review Focus 1)', async () => {
    const refs = conditionReferences.parse(await custom(NOTIFICATION_CONDITIONS_BINDING, 'conditionReferences', {}));
    expect(refs.facilities.length).toBeGreaterThan(0);
    const group = ((await graphql('{ recipient_groups(limit: 1, order_by: { name: asc }) { id } }')).recipient_groups as Row[])[0];
    const latest = ((await graphql('{ events(limit: 1, order_by: [{ occurred_at: desc }, { id: desc }]) { event_type } }')).events as Row[])[0];
    expect(group, 'a seeded recipient group').toBeDefined();
    expect(latest, 'a seeded event').toBeDefined();

    // Built the way the editor builds it: accepted by the console and by the database.
    const conditions = {};
    expect(validateConditions(conditions, refs)).toBeNull();
    const created = await graphql(
      `mutation ($name: String!, $group: uuid!, $type: event_types_enum!, $conditions: jsonb!) {
        insert_notification_rules_one(object: {
          name: $name, recipient_group_id: $group, is_active: false, conditions: $conditions,
          notification_rule_event_types: { data: [{ event_type: $type }] },
          notification_rule_channels: { data: [{ channel: in_app }, { channel: email }] }
        }) { id }
      }`,
      { name: `Dev test rule ${crypto.randomUUID()}`, group: group?.id, type: latest?.event_type, conditions },
    );
    ruleId = String((created.insert_notification_rules_one as Row).id);

    const countDeliveries = async () =>
      Number(
        ((await graphql('{ notification_deliveries_aggregate { aggregate { count } } }')).notification_deliveries_aggregate as {
          aggregate: { count: number };
        }).aggregate.count,
      );
    const before = await countDeliveries();

    const rows = testRow.array().parse(await custom(NOTIFICATIONS_BINDING, 'testNotificationRule', { ruleId, limit: 20 }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.reason).toBe('match');
    for (const row of rows) {
      expect(['match', 'event_type_mismatch', 'condition_mismatch']).toContain(row.reason);
      expect(row.would_match).toBe(row.reason === 'match');
      expect(row.recipient_count).toBe(row.recipients.length);
      if (!row.would_match) expect(row.recipients).toEqual([]);
      for (const recipient of row.recipients) {
        expect(['in_app', 'email']).toContain(recipient.channel);
        expect((recipient.user_id === null) !== (recipient.address === null)).toBe(true);
      }
    }

    // A dry run: nothing delivered, the rule not marked as triggered.
    expect(await countDeliveries()).toBe(before);
    const rule = (await graphql('query ($id: uuid!) { notification_rules_by_pk(id: $id) { last_triggered_at } }', { id: ruleId }))
      .notification_rules_by_pk as Row;
    expect(rule.last_triggered_at).toBeNull();

    // A minimum severity of critical: an event of the rule's type below it fails the conditions.
    await graphql('mutation ($id: uuid!, $c: jsonb!) { update_notification_rules_by_pk(pk_columns: { id: $id }, _set: { conditions: $c }) { id } }', {
      id: ruleId,
      c: { min_severity: 'critical' },
    });
    const narrowed = testRow.array().parse(await custom(NOTIFICATIONS_BINDING, 'testNotificationRule', { ruleId, limit: 20 }));
    for (const row of narrowed) {
      if (row.event_type === latest?.event_type && row.severity !== 'critical') expect(row.reason).toBe('condition_mismatch');
    }
  });

  it('should refuse what the console refuses: an area outside the facility, an unknown key, a webhook channel', async () => {
    const refs = conditionReferences.parse(await custom(NOTIFICATION_CONDITIONS_BINDING, 'conditionReferences', {}));
    const area = refs.areas[0];
    const other = refs.facilities.find((f) => f.id !== area?.facility_id);
    const insert = (conditions: Row) =>
      send('mutation ($c: jsonb!, $n: String!) { insert_notification_rules_one(object: { name: $n, conditions: $c, is_active: false }) { id } }', {
        c: conditions,
        n: `Dev refused ${crypto.randomUUID()}`,
      });
    for (const conditions of [{ building: 'B' }, { min_severity: 'urgent' }, ...(other === undefined ? [] : [{ facility_id: other.id, area_id: area?.id }])]) {
      expect(validateConditions(conditions, refs), JSON.stringify(conditions)).not.toBeNull();
      const body = await insert(conditions);
      expect(JSON.stringify(body.errors), JSON.stringify(conditions)).toContain('notification_rule_conditions_invalid');
    }
    if (ruleId !== '') {
      const body = await send('mutation ($r: uuid!) { insert_notification_rule_channels_one(object: { rule_id: $r, channel: webhook }) { id } }', {
        r: ruleId,
      });
      expect(JSON.stringify(body.errors)).toContain('notification_rule_channels_channel_not_webhook');
    }
  });

  it('should keep system templates read only and take a template whose placeholders the console accepts', async () => {
    const system = ((await graphql('{ notification_templates(where: { is_system: { _eq: true } }, limit: 1) { id } }')).notification_templates as Row[])[0];
    const touched = await graphql(
      'mutation ($id: uuid!) { update_notification_templates_by_pk(pk_columns: { id: $id }, _set: { body: "x" }) { id } }',
      { id: system?.id },
    );
    expect(touched.update_notification_templates_by_pk).toBeNull();

    const body = 'Seen {{ profile_name }} at {{facility}}, {{occurred_at}}.';
    expect(placeholderProblem(body)).toBeNull();
    const created = await graphql(
      'mutation ($n: String!, $b: String!) { insert_notification_templates_one(object: { name: $n, channel: sms, locale: "en", body: $b }) { id } }',
      { n: `dev_test_${crypto.randomUUID().slice(0, 8)}`, b: body },
    );
    templateId = String((created.insert_notification_templates_one as Row).id);
    const bad = 'Seen {{Profile}}';
    expect(placeholderProblem(bad)).not.toBeNull();
    const refused = await send(
      'mutation ($id: uuid!, $b: String!) { update_notification_templates_by_pk(pk_columns: { id: $id }, _set: { body: $b }) { id } }',
      { id: templateId, b: bad },
    );
    expect(JSON.stringify(refused.errors)).toContain('notification_templates_placeholders_valid');
  });
});
