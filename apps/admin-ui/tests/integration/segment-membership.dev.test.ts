import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { PROFILE_RESOURCE, SEGMENT_PROFILE_MEMBER_RESOURCE } from '../../src/data/resource-names';
import { evaluationResult, previewResult } from '../../src/modules/segments/segment-evaluation-ops';
import { SEGMENTS_BINDING } from '../../src/modules/segments/segment-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Preview, evaluation and membership against the dev stack (Nova, `org_admin`), on two segments
 * of the test's own, found by name and reused from run to run: a segment with members keeps its
 * history and can never be deleted, so each run reactivates them and archives them again at the
 * end, with no open membership left (manual ones removed, rule ones closed by evaluating the
 * archived segment). A preview of unsaved conditions creates nothing (Review Focus 3); adding a
 * rule member pins them as a manual member (Review Focus 4); removing ends a manual membership and
 * keeps it in the history.
 */

const DYNAMIC_NAME = 'Dev test: preview and evaluation';
const MANUAL_NAME = 'Dev test: manual membership';

const IDENTITY = { providerId: 'hasura', sessionKey: 'segment-membership-dev-test', scopeKey: null, bindingRevision: '1' } as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

type Row = Record<string, unknown>;
type GraphqlBody = { data?: Row; errors?: { message: string; extensions?: { code?: string } }[] };

const ref = (id: string) => ({ namespace: 'default', id });
const and = (...children: unknown[]) => ({ op: 'and', children });
const leaf = (field: string, operator: string, value: unknown) => ({ field, operator, value });

describe.skipIf(!DEV_STACK_ENABLED)('segment preview, evaluation and membership against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let person: Row;
  let other: Row;
  let dynamicId = '';
  let manualId = '';

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
  const custom = (kind: 'query' | 'mutation', operation: string, input: Row) => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: ref(operation), resource: SEGMENTS_BINDING, operation, input };
    return kind === 'query'
      ? provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context())
      : provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context());
  };
  const list = async (resource: string, filter: Row): Promise<readonly Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: { mode: 'offset', page: 1, perPage: 100 },
        filter,
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };
  /** The memberships of `profileId` in `segmentId`, through the console's membership resource. */
  const memberships = (segmentId: string, profileId: unknown) =>
    list(SEGMENT_PROFILE_MEMBER_RESOURCE, {
      and: [
        { field: 'segment_id', op: 'eq', value: segmentId },
        { field: 'profile_id', op: 'eq', value: profileId },
      ],
    });
  const open = async (segmentId: string, profileId: unknown) =>
    (await memberships(segmentId, profileId)).filter((row) => row.removed_at === null);

  /** Ends every open manual membership of the segment (what an interrupted run may have left). */
  const removeManual = async (segmentId: string): Promise<void> => {
    const opened = (
      (await graphql(
        'query ($s: uuid!) { segment_members(where: { segment_id: { _eq: $s }, removed_at: { _is_null: true }, source: { _eq: manual } }) { profile_id } }',
        { s: segmentId },
      )).segment_members as Row[]
    ).map((row) => row.profile_id);
    if (opened.length > 0) await custom('mutation', 'removeSegmentMembers', { segmentId, subjectIds: opened });
  };

  /** The test's segment of this name, active again with these fields and no manual member, or a new one. */
  const segmentNamed = async (name: string, fields: Row): Promise<string> => {
    const found = (await graphql('query ($n: String!) { segments(where: { name: { _eq: $n } }) { id } }', { n: name })).segments as Row[];
    const id = found[0]?.id;
    if (typeof id === 'string') {
      // Kind and target are fixed once created; only the rest is set again.
      const changeable = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'kind' && key !== 'target'));
      await graphql('mutation ($id: uuid!, $s: segments_set_input!) { update_segments_by_pk(pk_columns: { id: $id }, _set: $s) { id } }', {
        id,
        s: { ...changeable, status: 'active' },
      });
      await removeManual(id);
      return id;
    }
    const data = await graphql('mutation ($o: segments_insert_input!) { insert_segments_one(object: $o) { id } }', { o: { name, ...fields } });
    return String((data.insert_segments_one as Row).id);
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const people = await list(PROFILE_RESOURCE, {
      and: [
        { field: 'status', op: 'eq', value: 'active' },
        { field: 'processing_restricted', op: 'eq', value: false },
        { field: 'profile_type', op: 'eq', value: 'employee' },
      ],
    });
    [person, other] = [people[0] ?? {}, people[1] ?? {}];
    expect(person.id, 'two active employees in Nova').toBeDefined();
    expect(other.id).toBeDefined();
  }, 60_000);

  afterAll(async () => {
    for (const id of [manualId, dynamicId].filter((value) => value !== '')) {
      await removeManual(id);
      await graphql('mutation ($id: uuid!) { update_segments_by_pk(pk_columns: { id: $id }, _set: { status: archived }) { id } }', { id });
    }
    // Evaluated while archived, the dynamic segment matches nobody: its rule memberships close.
    if (dynamicId !== '') await custom('mutation', 'evaluateSegment', { segmentId: dynamicId });
  }, 60_000);

  it('should preview unsaved conditions without creating anything, and name a refused condition (Review Focus 3)', async () => {
    const before = (await graphql('{ segments_aggregate { aggregate { count } } }')).segments_aggregate;
    const conditions = and(leaf('first_name', 'eq', person.first_name), leaf('last_name', 'eq', person.last_name));
    const preview = previewResult.parse(await custom('query', 'previewSegment', { target: 'profiles', conditions }));
    expect(preview.count).toBeGreaterThanOrEqual(1);
    expect(preview.sample_ids).toContain(person.id);
    expect(preview.sample_labels).toContain(`${String(person.first_name)} ${String(person.last_name)}`);
    expect((await graphql('{ segments_aggregate { aggregate { count } } }')).segments_aggregate).toEqual(before);

    const refused = await send(
      'query ($c: jsonb!) { preview_segment(target: "profiles", conditions: $c, limit: 10) { count } }',
      { c: and(leaf('first_name', 'eq', 'x'), leaf('visits_last_30d', 'between', [9, 2])) },
    );
    expect(refused.errors?.[0]?.extensions?.code).toBe('segment_condition_invalid');
    expect(refused.errors?.[0]?.message).toBe('segment_condition_invalid:$.children[1].value');
  });

  it('should evaluate a dynamic segment and pin a rule member added by hand (Review Focus 4)', async () => {
    const conditions = and(leaf('first_name', 'eq', person.first_name), leaf('last_name', 'eq', person.last_name));
    dynamicId = await segmentNamed(DYNAMIC_NAME, { kind: 'dynamic', target: 'profiles', conditions });
    const evaluated = evaluationResult.parse(await custom('mutation', 'evaluateSegment', { segmentId: dynamicId, conditions }));
    expect(evaluated).toMatchObject({ segment_id: dynamicId, stale: false });
    expect(evaluated.member_count).toBeGreaterThanOrEqual(1);
    expect((await open(dynamicId, person.id)).map((row) => row.source)).toEqual(['rule']);

    expect(await custom('mutation', 'addSegmentMembers', { segmentId: dynamicId, subjectIds: [person.id] })).toEqual({ count: 1, kept: 0 });
    const [pinned] = await open(dynamicId, person.id);
    expect(pinned).toMatchObject({ source: 'manual', added_by: expect.any(String) });
    // The rule membership ended at the instant the manual one began.
    const rule = (await memberships(dynamicId, person.id)).find((row) => row.source === 'rule' && row.removed_at === pinned?.added_at);
    expect(rule, 'the closed rule membership').toBeDefined();
  });

  it('should add, remove and add again by hand, keeping the history', async () => {
    manualId = await segmentNamed(MANUAL_NAME, { kind: 'manual', target: 'profiles' });
    const before = (await memberships(manualId, person.id)).length;
    expect(await custom('mutation', 'addSegmentMembers', { segmentId: manualId, subjectIds: [person.id, other.id] })).toEqual({ count: 2, kept: 0 });
    expect((await open(manualId, person.id)).map((row) => row.source)).toEqual(['manual']);
    // Adding a manual member again opens nothing: the answer counts them as kept, not added.
    expect(await custom('mutation', 'addSegmentMembers', { segmentId: manualId, subjectIds: [person.id] })).toEqual({ count: 0, kept: 1 });
    expect(await memberships(manualId, person.id)).toHaveLength(before + 1);

    expect(await custom('mutation', 'removeSegmentMembers', { segmentId: manualId, subjectIds: [person.id] })).toEqual({ count: 1 });
    expect(await open(manualId, person.id)).toEqual([]);
    // Removing again closes nothing, and says so.
    expect(await custom('mutation', 'removeSegmentMembers', { segmentId: manualId, subjectIds: [person.id] })).toEqual({ count: 0 });
    const ended = (await memberships(manualId, person.id)).filter((row) => row.removed_at !== null);
    expect(ended.some((row) => typeof row.removed_by === 'string')).toBe(true);

    expect(await custom('mutation', 'addSegmentMembers', { segmentId: manualId, subjectIds: [person.id] })).toEqual({ count: 1, kept: 0 });
    expect(await memberships(manualId, person.id)).toHaveLength(before + 2);
    expect(await open(manualId, other.id)).toHaveLength(1);
  });

  it('should read the refusals of evaluating a manual segment and of adding to an archived one as sentences', async () => {
    // Its own fixture (reactivated, emptied): independent of the tests before it.
    const segmentId = await segmentNamed(MANUAL_NAME, { kind: 'manual', target: 'profiles' });
    manualId = segmentId;
    await expect(custom('mutation', 'evaluateSegment', { segmentId })).rejects.toMatchObject({
      kind: 'validation',
      code: 'segment_not_dynamic',
    });
    await graphql('mutation ($id: uuid!) { update_segments_by_pk(pk_columns: { id: $id }, _set: { status: archived }) { id } }', { id: segmentId });
    await expect(custom('mutation', 'addSegmentMembers', { segmentId, subjectIds: [person.id] })).rejects.toMatchObject({
      kind: 'validation',
      code: 'segment_archived',
    });
    expect(await open(segmentId, person.id)).toEqual([]);
  });
});
