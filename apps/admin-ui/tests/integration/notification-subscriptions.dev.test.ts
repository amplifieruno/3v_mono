import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { periodBounds } from '../../src/blocks/delivery-report/delivery-report-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { NOTIFICATION_DELIVERY_RESOURCE, NOTIFICATION_SUBSCRIPTION_RESOURCE } from '../../src/data/resource-names';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * My subscriptions and the delivery log against the dev stack (Nova, `org_admin`, the seeded
 * history). A member lists only their own subscriptions; one without any filter or on a webhook is
 * refused; the console's resource creates one for the session user and switches it off (deleted
 * by the test afterwards). The log's computed columns agree with the stored ones (origin, title,
 * escalation policy, "to me"), other members' subscription deliveries stay hidden, and the
 * delivery report counts what the log lists.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'notification-subscriptions-dev-test', scopeKey: null, bindingRevision: '1' } as const;

const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext =>
  ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

type Row = Record<string, unknown>;

describe.skipIf(!DEV_STACK_ENABLED)('subscriptions and deliveries against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const made: string[] = [];

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

  const list = async (resource: string, filter: Row | null, perPage = 100): Promise<readonly Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: resource },
        resource,
        pagination: offsetPage(1, perPage),
        ...(filter === null ? {} : { filter }),
        sort: [{ field: 'created_at', direction: 'desc' }],
      } as never) as never,
      queryContext(),
    )) as { data: readonly Row[] };
    return data;
  };

  const mutate = (kind: 'createOne' | 'updateOne', input: Row, id?: string) =>
    provider.mutations?.[kind]?.(
      createMutationDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: NOTIFICATION_SUBSCRIPTION_RESOURCE },
        resource: NOTIFICATION_SUBSCRIPTION_RESOURCE,
        idField: 'id',
        kind,
        input,
        ...(id === undefined ? {} : { id }),
      } as never) as never,
      mutationContext(),
    ) as Promise<{ record: Row }>;

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  afterAll(async () => {
    if (made.length > 0) await admin('mutation ($ids: [uuid!]!) { delete_notification_subscriptions(where: { id: { _in: $ids } }) { affected_rows } }', { ids: made });
  });

  it('should list only the member’s own subscriptions', async () => {
    const mine = await list(NOTIFICATION_SUBSCRIPTION_RESOURCE, null);
    const all = (await admin('{ notification_subscriptions { id user_id organization_id } }')).notification_subscriptions as Row[];
    const ids = new Set(mine.map((row) => row.id));
    const others = all.filter((row) => !ids.has(row.id));
    expect(mine.length).toBeGreaterThan(0);
    // The seed gives two members of Nova one subscription each: the other one is never listed.
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(mine.map((row) => row.user_id)).size).toBe(1);
  });

  it('should refuse a subscription without a filter or on a webhook, and create and switch off a valid one', async () => {
    const empty = await send('mutation { insert_notification_subscriptions_one(object: { channel: in_app }) { id } }');
    expect(JSON.stringify(empty.errors)).toContain('notification_subscriptions_needs_filter');
    const webhook = await send('mutation { insert_notification_subscriptions_one(object: { channel: webhook, event_type: blacklist_match }) { id } }');
    expect(JSON.stringify(webhook.errors)).toContain('notification_subscriptions_channel_not_webhook');

    const { record } = await mutate('createOne', { event_type: 'blacklist_match', channel: 'in_app', min_severity: 'high', is_active: true });
    made.push(String(record.id));
    const mine = await list(NOTIFICATION_SUBSCRIPTION_RESOURCE, null);
    expect(mine.find((row) => row.id === record.id)?.user_id).toBe(mine.find((row) => row.id !== record.id)?.user_id);

    const { record: off } = await mutate('updateOne', { is_active: false }, String(record.id));
    expect(off.is_active).toBe(false);
  });

  it('should compute origin, title, escalation policy and "to me" from the stored delivery', async () => {
    const rows = (
      await graphql(`{
        notification_deliveries(order_by: { created_at: desc }, limit: 300) {
          id origin title to_me escalation_policy_id rule_id escalation_step_id subscription_id report_id recipient_user_id content
          escalation_step { policy_id }
        }
      }`)
    ).notification_deliveries as Row[];
    expect(rows.length).toBeGreaterThan(0);
    const origins = new Set<unknown>();
    for (const row of rows) {
      const expected = row.rule_id ? 'rule' : row.escalation_step_id ? 'escalation' : row.subscription_id ? 'subscription' : 'report';
      expect(row.origin, String(row.id)).toBe(expected);
      origins.add(row.origin);
      expect(row.title).toBe((row.content as Row).title ?? null);
      expect(row.escalation_policy_id).toBe((row.escalation_step as Row | null)?.policy_id ?? null);
    }
    expect(origins.size).toBeGreaterThan(1);

    const mine = await list(NOTIFICATION_DELIVERY_RESOURCE, { field: 'to_me', op: 'eq', value: true });
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((row) => row.recipient_user_id)).size).toBe(1);
    const dead = await list(NOTIFICATION_DELIVERY_RESOURCE, { field: 'status', op: 'eq', value: 'dead_letter' });
    expect(dead.every((row) => row.status === 'dead_letter')).toBe(true);
  });

  it('should hide other members’ subscription deliveries', async () => {
    const all = (await admin('{ notification_deliveries(where: { subscription_id: { _is_null: false } }) { id recipient_user_id } }'))
      .notification_deliveries as Row[];
    const visible = (await graphql('{ notification_deliveries(where: { subscription_id: { _is_null: false } }) { id recipient_user_id } }'))
      .notification_deliveries as Row[];
    expect(all.length).toBeGreaterThan(visible.length);
    expect(new Set(visible.map((row) => row.recipient_user_id)).size).toBeLessThanOrEqual(1);
  });

  it('should count in the delivery report what the log lists for the period', async () => {
    const { from, to } = periodBounds('30d');
    const report = (await graphql(
      `query ($from: timestamptz!, $to: timestamptz!) {
        delivery_report(args: { p_from: $from, p_to: $to }) { channel total digested dead_letter }
      }`,
      { from, to },
    )).delivery_report as Row[];
    expect(report.map((row) => row.channel).sort()).toEqual(['email', 'in_app', 'push', 'sms', 'webhook']);
    for (const channel of ['in_app', 'email', 'sms', 'push']) {
      const counted = (await graphql(
        `query ($from: timestamptz!, $to: timestamptz!, $channel: notification_channels_enum!) {
          total: notification_deliveries_aggregate(where: { channel: { _eq: $channel }, created_at: { _gte: $from, _lt: $to }, status: { _neq: digested } }) { aggregate { count } }
          dead: notification_deliveries_aggregate(where: { channel: { _eq: $channel }, created_at: { _gte: $from, _lt: $to }, status: { _eq: dead_letter } }) { aggregate { count } }
        }`,
        { from, to, channel },
      )) as { total: { aggregate: { count: number } }; dead: { aggregate: { count: number } } };
      const row = report.find((entry) => entry.channel === channel);
      expect(row?.total, channel).toBe(counted.total.aggregate.count);
      expect(row?.dead_letter, channel).toBe(counted.dead.aggregate.count);
    }

    const invalid = await send('{ delivery_report(args: { p_from: "2026-10-02T00:00:00Z", p_to: "2026-10-01T00:00:00Z" }) { channel } }');
    expect(JSON.stringify(invalid.errors)).toContain('report_period_invalid');
  });
});
