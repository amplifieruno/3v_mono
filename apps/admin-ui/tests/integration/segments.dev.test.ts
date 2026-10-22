import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { SEGMENT_STATS_BINDING } from '../../src/blocks/segment-stats/segment-stats-query';
import { segmentStatSeries } from '../../src/blocks/segment-stats/segment-stats-series';
import { createItapHasuraProvider } from '../../src/data/provider';
import { SEGMENTS_BINDING } from '../../src/modules/segments/segment-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Segments against the dev stack (Nova, `org_admin`), on segments the test creates and deletes.
 * "Create segment" on a built-in template copies its target and conditions into a dynamic
 * segment; a manual segment keeps `{}`; a delete the database refuses reads as its reason
 * (Review Focus 5: named by another segment's conditions, scoped by an event rule, with history),
 * and nothing is deleted; the trend reads 30 days of a seeded segment's figures.
 */

const SESSION = { providerId: 'hasura', sessionKey: 'segments-dev-test', scopeKey: null, bindingRevision: '1' } as const;

const session = { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 };
const queryContext = (): QueryContext =>
  ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});

type Row = Record<string, unknown>;
type GraphqlBody = { data?: Row; errors?: { message: string }[] };

describe.skipIf(!DEV_STACK_ENABLED)('segments against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const created: string[] = [];

  const send = async (query: string, variables: Row = {}): Promise<GraphqlBody> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as GraphqlBody;
  };
  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await send(query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };
  const descriptor = (resource: string, operation: string, input: Row) => ({
    ...SESSION,
    kind: 'custom',
    ref: { namespace: 'default', id: operation },
    resource,
    operation,
    input,
  });
  const mutate = async (operation: string, input: Row): Promise<Row> =>
    (await provider.mutations?.custom?.(
      createMutationDescriptor(descriptor(SEGMENTS_BINDING, operation, input) as never) as never,
      mutationContext(),
    )) as Row;
  const segmentRow = async (id: string): Promise<Row | null> =>
    ((await graphql('query ($id: uuid!) { segments_by_pk(id: $id) { id kind target conditions status template_id } }', { id }))
      .segments_by_pk as Row | null) ?? null;
  const insertSegment = async (object: Row): Promise<string> => {
    const data = await graphql('mutation ($o: segments_insert_input!) { insert_segments_one(object: $o) { id } }', { o: object });
    const id = String((data.insert_segments_one as Row).id);
    created.push(id);
    return id;
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  }, 60_000);

  afterAll(async () => {
    // Newest first: a dynamic segment naming a manual one goes before it.
    for (const id of [...created].reverse()) {
      const body = await send('mutation ($id: uuid!) { delete_segments_by_pk(id: $id) { id } }', { id });
      // Evaluated meanwhile (the hourly figures): kept with its history, so it is archived instead.
      if (body.errors !== undefined) {
        await graphql('mutation ($id: uuid!) { update_segments_by_pk(pk_columns: { id: $id }, _set: { status: archived }) { id } }', { id });
      }
    }
  }, 60_000);

  it('should create a dynamic segment from a built-in template with its target and conditions', async () => {
    const template = (
      (await graphql('{ segment_templates(where: { is_system: { _eq: true } }, order_by: { name: asc }, limit: 1) { id target conditions } }'))
        .segment_templates as Row[]
    )[0];
    expect(template, 'a seeded built-in template').toBeDefined();
    const name = `Dev template segment ${crypto.randomUUID().slice(0, 8)}`;
    const answer = await mutate('createSegmentFromTemplate', {
      templateId: template?.id,
      target: template?.target,
      conditions: template?.conditions,
      name,
      description: null,
    });
    created.push(String(answer.id));
    expect(String(answer.code)).toMatch(/^SEGMENT-\d{5}$/);
    expect(await segmentRow(String(answer.id))).toMatchObject({
      kind: 'dynamic',
      target: template?.target,
      conditions: template?.conditions,
      template_id: template?.id,
      status: 'active',
    });

    // The same name again: the database's reason, nothing created.
    await expect(
      mutate('createSegmentFromTemplate', { templateId: template?.id, target: template?.target, conditions: template?.conditions, name }),
    ).rejects.toMatchObject({ kind: 'validation', code: 'segments_organization_id_name_key' });
  });

  it('should keep a manual segment without conditions and refuse to delete one another segment names (Review Focus 5)', async () => {
    const manual = await insertSegment({ name: `Dev manual ${crypto.randomUUID().slice(0, 8)}`, kind: 'manual', target: 'profiles' });
    expect(await segmentRow(manual)).toMatchObject({ kind: 'manual', conditions: {} });
    const dynamic = await insertSegment({
      name: `Dev naming ${crypto.randomUUID().slice(0, 8)}`,
      kind: 'dynamic',
      target: 'profiles',
      conditions: { field: 'member_of_segment', operator: 'eq', value: manual },
    });

    const refused = mutate('deleteSegment', { segmentId: manual });
    await expect(refused).rejects.toMatchObject({ kind: 'validation', code: 'segment_referenced' });
    await refused.catch((error: { details?: { issues?: { message: { default: string } }[] } }) => {
      expect(error.details?.issues?.[0]?.message.default).toMatch(/^This segment is named by the conditions/);
    });
    expect(await segmentRow(manual)).not.toBeNull();

    // Once nothing names it, it goes (neither has members or figures yet).
    expect(await mutate('deleteSegment', { segmentId: dynamic })).toMatchObject({ id: dynamic });
    expect(await mutate('deleteSegment', { segmentId: manual })).toMatchObject({ id: manual });
    created.splice(0, created.length, ...created.filter((id) => id !== dynamic && id !== manual));
  });

  it('should refuse to delete a segment an event rule is scoped to, or one with history', async () => {
    const scoped = (
      (await graphql('{ event_rule_version_scopes(where: { segment_id: { _is_null: false } }, limit: 1) { segment_id } }'))
        .event_rule_version_scopes as Row[]
    )[0];
    if (scoped !== undefined) {
      await expect(mutate('deleteSegment', { segmentId: scoped.segment_id })).rejects.toMatchObject({
        kind: 'validation',
        code: expect.stringMatching(/^(event_rule_version_scopes_segment_fkey|segment_referenced)$/),
      });
    }
    const withHistory = (
      (await graphql('{ segments(where: { member_count: { _gt: 0 } }, order_by: { name: asc }, limit: 1) { id } }')).segments as Row[]
    )[0];
    expect(withHistory, 'a seeded segment with members').toBeDefined();
    await expect(mutate('deleteSegment', { segmentId: withHistory?.id })).rejects.toMatchObject({ kind: 'validation' });
    expect(await segmentRow(String(withHistory?.id))).not.toBeNull();
  });

  it('should read the trend of a seeded segment as 30 days of figures', async () => {
    const segment = (
      (await graphql('{ segments(where: { member_count: { _gt: 0 } }, order_by: { member_count: desc }, limit: 1) { id } }')).segments as Row[]
    )[0];
    const answer = await provider.queries?.custom?.(
      createQueryDescriptor(
        { ...descriptor(SEGMENT_STATS_BINDING, 'segmentDailyStats', { segmentId: segment?.id }) } as never,
      ) as never,
      queryContext(),
    );
    const series = segmentStatSeries.parse(answer);
    expect(series.points).toHaveLength(30);
    expect(series.points.some((point) => point.members !== null)).toBe(true);
  });
});
