import { type DataProvider, type MutationContext, createMutationDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { WEBHOOK_SUBSCRIPTION_RESOURCE } from '../../src/data/resource-names';
import {
  acknowledgeNotificationOperation,
  inboxSummaryOperation,
  markAllNotificationsReadOperation,
} from '../../src/modules/notifications/inbox-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';

/**
 * The inbox and webhooks against the dev stack (Nova, `org_admin`), through the console's own
 * documents. "Mark all read" reads only the signed-in member's notifications, never another
 * member's (plan 06 Review Focus 5); acknowledging an escalation page acknowledges its open
 * incident (Review Focus 3); a webhook to a link-local or credentialed address is refused by the
 * database, a private one is saved (the sender decides, Review Focus 4) and the secret is never
 * readable. Everything the test changes is put back or deleted.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'inbox-webhooks-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});

type Row = Record<string, unknown>;
const documentOf = (entry: { readonly document: unknown }) => (entry.document as { readonly document: string }).document;

describe.skipIf(!DEV_STACK_ENABLED)('inbox and webhooks against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let me = '';
  let organization = '';
  const cleanups: (() => Promise<unknown>)[] = [];

  const post = async (headers: Record<string, string>, query: string, variables: Row = {}) => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as { data?: Row; errors?: { message: string }[] };
  };
  const send = async (query: string, variables: Row = {}) => post({ Authorization: `Bearer ${await auth.getToken()}` }, query, variables);
  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await send(query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };
  const admin = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await post({ 'x-hasura-admin-secret': devAdminSecret() }, query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };
  const unreadOf = async (user: string): Promise<string[]> =>
    (
      (await admin(
        'query ($org: uuid!, $user: uuid!) { user_notifications(where: { organization_id: { _eq: $org }, user_id: { _eq: $user }, read_at: { _is_null: true } }) { id } }',
        { org: organization, user },
      )).user_notifications as Row[]
    ).map((row) => String(row.id));
  const markUnread = (ids: readonly string[]) =>
    admin('mutation ($ids: [uuid!]!) { update_user_notifications(where: { id: { _in: $ids } }, _set: { read_at: null }) { affected_rows } }', {
      ids,
    });

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    me = String((await auth.getIdentity({} as never))?.id);
    const orgs = (await admin('{ organizations(where: { name: { _eq: "Nova Tower Business Center" } }) { id } }')).organizations as Row[];
    organization = String(orgs[0]?.id);
  });

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

  it('should mark all read only the signed-in member’s notifications', async () => {
    const others = (
      (await admin(
        'query ($org: uuid!, $me: uuid!) { user_notifications(distinct_on: user_id, where: { organization_id: { _eq: $org }, user_id: { _neq: $me } }) { user_id } }',
        { org: organization, me },
      )).user_notifications as Row[]
    ).map((row) => String(row.user_id));
    expect(others.length).toBeGreaterThan(0);
    const other = others[0] as string;
    // Make sure both members have something unread, and put every read time back afterwards.
    const mineBefore = await unreadOf(me);
    const otherBefore = await unreadOf(other);
    const newest = async (user: string) =>
      String(
        (
          (await admin(
            'query ($org: uuid!, $user: uuid!) { user_notifications(where: { organization_id: { _eq: $org }, user_id: { _eq: $user }, acknowledged_at: { _is_null: true } }, order_by: { created_at: desc }, limit: 1) { id } }',
            { org: organization, user },
          )).user_notifications as Row[]
        )[0]?.id,
      );
    const myExtra = mineBefore.length > 0 ? [] : [await newest(me)];
    const otherExtra = otherBefore.length > 0 ? [] : [await newest(other)];
    await markUnread([...myExtra, ...otherExtra]);
    const mineUnread = await unreadOf(me);
    const otherUnread = await unreadOf(other);
    cleanups.push(async () => {
      await markUnread(mineBefore);
      const read = [...myExtra, ...otherExtra];
      if (read.length > 0) {
        await admin('mutation ($ids: [uuid!]!) { update_user_notifications(where: { id: { _in: $ids } }, _set: { read_at: "now()" }) { affected_rows } }', { ids: read });
      }
    });
    expect(mineUnread.length).toBeGreaterThan(0);
    expect(otherUnread.length).toBeGreaterThan(0);

    // The crons may add notifications while the test runs (fan-out, escalation, digests), so the
    // checks are about the rows read above and about ownership, not about exact global counts.
    const before = await graphql(documentOf(inboxSummaryOperation));
    expect((before.unread as { aggregate: { count: number } }).aggregate.count).toBeGreaterThanOrEqual(mineUnread.length);

    const marked = ((await graphql(documentOf(markAllNotificationsReadOperation))).mark_notifications_read as Row[]).map((row) => String(row.id));
    expect(marked).toEqual(expect.arrayContaining(mineUnread));
    // Nothing marked belongs to another member: every marked row is the signed-in member's.
    const owners = (
      (await admin('query ($ids: [uuid!]!) { user_notifications(where: { id: { _in: $ids } }) { user_id } }', { ids: marked }))
        .user_notifications as Row[]
    ).map((row) => String(row.user_id));
    expect(owners).toHaveLength(marked.length);
    expect(new Set(owners)).toEqual(new Set([me]));
    expect(marked.filter((id) => otherUnread.includes(id))).toEqual([]);
    const mineLeft = await unreadOf(me);
    expect(mineLeft.filter((id) => mineUnread.includes(id))).toEqual([]);
    expect(await unreadOf(other)).toEqual(expect.arrayContaining(otherUnread));
    // The bell's count matches: at most what is unread now (only newer arrivals can be).
    const after = await graphql(documentOf(inboxSummaryOperation));
    expect((after.unread as { aggregate: { count: number } }).aggregate.count).toBeLessThanOrEqual((await unreadOf(me)).length);
    // The inbox lists the member's own rows only.
    const listed = (await graphql('{ user_notifications(limit: 500) { user_id } }')).user_notifications as Row[];
    expect(new Set(listed.map((row) => row.user_id))).toEqual(new Set([me]));
  }, 60_000);

  it('should acknowledge the incident of an escalation page acknowledged in the inbox', async () => {
    const facilities = (await graphql('{ facilities(limit: 1, order_by: { name: asc }) { id } }')).facilities as Row[];
    const incident = String(
      ((await graphql('mutation ($o: incidents_insert_input!) { insert_incidents_one(object: $o) { id } }', {
        o: { title: `Console inbox dev test ${crypto.randomUUID()}`, severity: 'low', facility_id: facilities[0]?.id },
      })).insert_incidents_one as Row).id,
    );
    cleanups.push(() => admin('mutation ($id: uuid!) { delete_incidents_by_pk(id: $id) { id } }', { id: incident }));
    const steps = (await admin('query ($org: uuid!) { escalation_policy_steps(where: { organization_id: { _eq: $org } }, limit: 1) { id } }', {
      org: organization,
    })).escalation_policy_steps as Row[];
    expect(steps.length).toBe(1);
    const delivery = String(
      ((await admin('mutation ($o: notification_deliveries_insert_input!) { insert_notification_deliveries_one(object: $o) { id } }', {
        o: {
          organization_id: organization,
          escalation_step_id: steps[0]?.id,
          escalation_cycle: 0,
          incident_id: incident,
          recipient_user_id: me,
          channel: 'in_app',
          status: 'delivered',
          priority: 'critical',
          content: { title: 'Escalation dev test' },
        },
      })).insert_notification_deliveries_one as Row).id,
    );
    cleanups.push(() => admin('mutation ($id: uuid!) { delete_notification_deliveries_by_pk(id: $id) { id } }', { id: delivery }));
    const notification = String(
      ((await admin('mutation ($o: user_notifications_insert_input!) { insert_user_notifications_one(object: $o) { id } }', {
        o: { organization_id: organization, user_id: me, delivery_id: delivery, incident_id: incident, title: 'Escalation dev test', priority: 'critical' },
      })).insert_user_notifications_one as Row).id,
    );
    cleanups.push(() => admin('mutation ($id: uuid!) { delete_user_notifications_by_pk(id: $id) { id } }', { id: notification }));

    const answer = (await graphql(documentOf(acknowledgeNotificationOperation), { notification })).acknowledge_notification as Row[];
    expect(answer[0]?.acknowledged_at).toBeTruthy();
    expect(answer[0]?.read_at).toBeTruthy();
    const state = await graphql(
      'query ($incident: uuid!, $delivery: uuid!) { incidents_by_pk(id: $incident) { status acknowledged_by acknowledged_at } notification_deliveries_by_pk(id: $delivery) { acknowledged_at } }',
      { incident, delivery },
    );
    expect(state.incidents_by_pk).toMatchObject({ status: 'acknowledged', acknowledged_by: me });
    expect((state.notification_deliveries_by_pk as Row).acknowledged_at).toBeTruthy();
    // Another member's real notification is not the caller's to acknowledge or mark.
    const other = String(
      ((await admin(
        'query ($org: uuid!, $me: uuid!) { organization_members(where: { organization_id: { _eq: $org }, user_id: { _neq: $me } }, limit: 1) { user_id } }',
        { org: organization, me },
      )).organization_members as Row[])[0]?.user_id,
    );
    const foreignRow = String(
      ((await admin('mutation ($o: user_notifications_insert_input!) { insert_user_notifications_one(object: $o) { id } }', {
        o: { organization_id: organization, user_id: other, title: 'Foreign dev test', priority: 'low' },
      })).insert_user_notifications_one as Row).id,
    );
    cleanups.push(() => admin('mutation ($id: uuid!) { delete_user_notifications_by_pk(id: $id) { id } }', { id: foreignRow }));
    const foreign = await send(documentOf(acknowledgeNotificationOperation), { notification: foreignRow });
    expect(JSON.stringify(foreign.errors)).toContain('notification_not_found');
    const marked = await send('mutation ($ids: _uuid!) { mark_notifications_read(args: { p_ids: $ids }) { id } }', { ids: `{${foreignRow}}` });
    expect(JSON.stringify(marked.data?.mark_notifications_read ?? [])).not.toContain(foreignRow);
    const untouched = (await admin('query ($id: uuid!) { user_notifications_by_pk(id: $id) { read_at acknowledged_at } }', { id: foreignRow }))
      .user_notifications_by_pk as Row;
    expect(untouched.read_at).toBeNull();
    expect(untouched.acknowledged_at).toBeNull();
  }, 60_000);

  it('should refuse link-local and credentialed webhook addresses, save a private one and never read the secret back', async () => {
    const create = (input: Row) =>
      provider.mutations?.createOne?.(
        createMutationDescriptor({
          ...IDENTITY,
          ref: { namespace: 'default', id: WEBHOOK_SUBSCRIPTION_RESOURCE },
          resource: WEBHOOK_SUBSCRIPTION_RESOURCE,
          idField: 'id',
          kind: 'createOne',
          input,
        } as never) as never,
        mutationContext(),
      ) as Promise<{ record: Row }>;
    const secret = 'dev-test-secret-0123456789';
    for (const url of ['http://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/hook']) {
      const refused = await send('mutation ($o: webhook_subscriptions_insert_input!) { insert_webhook_subscriptions_one(object: $o) { id } }', {
        o: { url, secret },
      });
      expect(JSON.stringify(refused.errors), url).toContain('webhook_subscriptions_url_valid');
    }
    const short = await send('mutation { insert_webhook_subscriptions_one(object: { url: "https://example.com/hook", secret: "short" }) { id } }');
    expect(JSON.stringify(short.errors)).toContain('webhook_subscriptions_secret_length');

    const { record } = await create({ url: 'http://10.0.0.5:8080/hook', secret, description: 'Console dev test', is_active: false });
    cleanups.push(() => admin('mutation ($id: uuid!) { delete_webhook_subscriptions_by_pk(id: $id) { id } }', { id: record.id }));
    expect(record.url).toBe('http://10.0.0.5:8080/hook');
    expect(record).not.toHaveProperty('secret');
    const readSecret = await send('query ($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { secret } }', { id: record.id });
    expect(JSON.stringify(readSecret.errors)).toMatch(/secret/);

    // Event types are rows of their own, each once per webhook.
    await graphql('mutation ($s: uuid!) { insert_webhook_subscription_event_types_one(object: { subscription_id: $s, event_type: blacklist_match }) { id } }', {
      s: record.id,
    });
    const twice = await send(
      'mutation ($s: uuid!) { insert_webhook_subscription_event_types_one(object: { subscription_id: $s, event_type: blacklist_match }) { id } }',
      { s: record.id },
    );
    expect(JSON.stringify(twice.errors)).toMatch(/Uniqueness violation/);
  }, 60_000);

  it('should list the webhook deliveries with their request and response columns', async () => {
    const rows = (await graphql(
      '{ webhook_deliveries(order_by: { created_at: desc }, limit: 20) { id status attempts response_code signature body error event_type subscription_id } }',
    )).webhook_deliveries as Row[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(['pending', 'sent', 'failed', 'retrying', 'dead_letter']).toContain(row.status);
    const sent = rows.find((row) => row.status === 'sent');
    expect(sent?.response_code).toBeGreaterThanOrEqual(200);
    expect(String(sent?.signature)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
