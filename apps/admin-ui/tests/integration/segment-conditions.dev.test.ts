import { type DataProvider, type QueryContext, createQueryDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { catalogOf } from '../../src/fields/segment-conditions-operators';
import { conditionPathIn } from '../../src/fields/segment-conditions-path';
import { SEGMENT_CONDITIONS_BINDING, type SegmentConditionsData, segmentConditionsData } from '../../src/fields/segment-conditions-query';
import { validateSegmentConditions } from '../../src/fields/segment-conditions-validate';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * The conditions editor's catalog and client validation against the dev stack (Nova,
 * `org_admin`): `segment_fields` answers each target's fields (custom fields included for
 * profiles), and for each sample the client's first problem is on the path the database's
 * refusal names (`segment_condition_invalid:<path>`), or both accept it. Accepted samples are
 * inserted as dynamic segments and deleted again.
 */

const SESSION = { providerId: 'hasura', sessionKey: 'segment-conditions-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const queryContext = (): QueryContext =>
  ({
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
  }) as QueryContext;

type Row = Record<string, unknown>;
type GraphqlBody = { data?: Row; errors?: { message: string }[] };
const leaf = (field: string, operator: string, value: unknown) => ({ field, operator, value });
const and = (...children: unknown[]) => ({ op: 'and', children });

describe.skipIf(!DEV_STACK_ENABLED)('segment conditions against the dev stack', () => {
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
  const catalog = async (target: string): Promise<SegmentConditionsData> =>
    segmentConditionsData.parse(
      await provider.queries?.custom?.(
        createQueryDescriptor({
          ...SESSION,
          kind: 'custom',
          ref: { namespace: 'default', id: 'catalog' },
          resource: SEGMENT_CONDITIONS_BINDING,
          operation: 'catalog',
          input: { target },
        } as never) as never,
        queryContext(),
      ),
    );

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  }, 60_000);

  afterAll(async () => {
    for (const id of created) {
      const body = await send('mutation ($id: uuid!) { delete_segments_by_pk(id: $id) { id } }', { id });
      // Evaluated meanwhile (members, figures): kept with its history, so it is archived instead.
      if (body.errors !== undefined) {
        await send('mutation ($id: uuid!) { update_segments_by_pk(pk_columns: { id: $id }, _set: { status: archived }) { id } }', { id });
      }
    }
  }, 60_000);

  it('should read each target’s catalog and the records conditions can name', async () => {
    const profiles = await catalog('profiles');
    const fields = profiles.fields.map((row) => row.field);
    expect(fields).toEqual(expect.arrayContaining(['profile_type', 'company_id', 'member_of_segment', 'visits_last_30d', 'top_area_id']));
    expect(fields.some((name) => name.startsWith('custom_fields.'))).toBe(true);
    expect(profiles.refs.areas.length).toBeGreaterThan(0);
    expect(profiles.refs.segments.some((row) => row.kind === 'manual')).toBe(true);
    const identities = (await catalog('identities')).fields.map((row) => row.field);
    expect(identities).toEqual(expect.arrayContaining(['status', 'age', 'attributes.gender', 'first_seen_at', 'linked']));
    expect(identities.some((name) => name.startsWith('custom_fields.'))).toBe(false);
  });

  it('should refuse on the client exactly where the database refuses', async () => {
    const data = await catalog('profiles');
    const ctx = { catalog: catalogOf(data.fields), refs: data.refs, target: 'profiles' };
    const dynamic = data.refs.segments.find((row) => row.kind === 'dynamic' && row.target === 'profiles');
    const manual = data.refs.segments.find((row) => row.kind === 'manual' && row.target === 'profiles');
    const company = data.refs.companies[0];
    const area = data.refs.areas[0];
    expect(dynamic !== undefined && manual !== undefined && company !== undefined && area !== undefined).toBe(true);
    const samples: unknown[] = [
      leaf('custom_fields.no_such_field', 'eq', 'x'),
      and(leaf('status', 'eq', 'active'), leaf('visits_last_30d', 'between', [9, 5])),
      leaf('member_of_segment', 'eq', dynamic?.id),
      leaf('end_date', 'eq', { relative_days: 36501 }),
      leaf('company_id', 'in', [company?.id, crypto.randomUUID()]),
      leaf('profile_type', 'contains', 'vip'),
      { op: 'not', children: [leaf('status', 'eq', 'active'), leaf('has_face', 'eq', true)] },
      and(leaf('status', 'eq', 'active'), { op: 'or', children: [leaf('department', 'is_null', 'no')] }),
      and(
        leaf('profile_type', 'eq', 'contractor'),
        leaf('end_date', 'between', [{ relative_days: 0 }, { relative_days: 30 }]),
        { op: 'not', children: [leaf('member_of_segment', 'in', [manual?.id])] },
        leaf('top_area_id', 'eq', area?.id),
        leaf('custom_fields.shift', 'in', ['night']),
      ),
    ];
    for (const conditions of samples) {
      const client = validateSegmentConditions(conditions, ctx)[0]?.path ?? null;
      const body = await send('mutation ($o: segments_insert_input!) { insert_segments_one(object: $o) { id } }', {
        o: { name: `Dev conditions ${crypto.randomUUID().slice(0, 8)}`, kind: 'dynamic', target: 'profiles', conditions },
      });
      const inserted = body.data?.insert_segments_one as Row | undefined;
      if (inserted !== undefined) created.push(String(inserted.id));
      const server = body.errors === undefined ? null : conditionPathIn(body.errors.map((error) => error.message).join(' '));
      expect(client, JSON.stringify(conditions)).toBe(server);
      if (body.errors !== undefined) expect(server, JSON.stringify(body.errors)).not.toBeNull();
    }
    expect(created).toHaveLength(1);
  });
});
