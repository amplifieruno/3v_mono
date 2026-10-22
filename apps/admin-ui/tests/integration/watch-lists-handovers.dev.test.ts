import { type DataProvider, type MutationContext, createMutationDescriptor, createQueryDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';

/**
 * Watch lists, shift handovers and operator workspaces against the dev stack (Nova, `org_admin`),
 * on rows the test creates and deletes (handovers with the admin secret: an acknowledged one is
 * history for the role). An entry names exactly one subject and counts while unexpired; "Add open
 * incidents" links every incident still being handled once, and the next operator reads them with
 * their status (plan 05 Review Focus 5); only the recipient acknowledges, idempotently; a new
 * default workspace takes over from the previous one.
 */

const SESSION = { providerId: 'hasura', sessionKey: 'watch-handover-dev-test', scopeKey: null, bindingRevision: '1' } as const;

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
type GraphqlBody = { data?: Row; errors?: { message: string }[] };

const ACTIVE = ['open', 'acknowledged', 'investigating'];

describe.skipIf(!DEV_STACK_ENABLED)('watch lists, handovers and workspaces against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let me = '';
  let other = '';
  const handovers: string[] = [];
  const workspaces: string[] = [];
  let listId = '';
  let previousDefault: string | null = null;

  const run = async (kind: 'query' | 'mutation', operation: string, input: Row): Promise<Row> => {
    const descriptor = { ...SESSION, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: MONITORING_BINDING, operation, input };
    if (kind === 'query') return (await provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context() as never)) as Row;
    return (await provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context())) as Row;
  };
  const post = async (headers: Record<string, string>, query: string, variables: Row): Promise<GraphqlBody> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as GraphqlBody;
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

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    me = String((await auth.getIdentity({} as never))?.id);
    const members = (
      await graphql('query ($me: uuid!) { organization_members(where: { status: { _eq: active }, user_id: { _neq: $me } }, limit: 1) { user_id } }', {
        me,
      })
    ).organization_members as Row[];
    other = String(members[0]?.user_id ?? '');
    const defaults = (await graphql('{ operator_workspaces(where: { is_default: { _eq: true } }) { id } }')).operator_workspaces as Row[];
    previousDefault = (defaults[0]?.id as string | undefined) ?? null;
  }, 60_000);

  afterAll(async () => {
    if (handovers.length > 0) await admin('mutation ($ids: [uuid!]!) { delete_shift_handovers(where: { id: { _in: $ids } }) { affected_rows } }', { ids: handovers });
    if (listId !== '') await graphql('mutation ($id: uuid!) { delete_watch_lists_by_pk(id: $id) { id } }', { id: listId });
    if (workspaces.length > 0) await graphql('mutation ($ids: [uuid!]!) { delete_operator_workspaces(where: { id: { _in: $ids } }) { affected_rows } }', { ids: workspaces });
    if (previousDefault !== null) {
      await graphql('mutation ($id: uuid!) { update_operator_workspaces_by_pk(pk_columns: { id: $id }, _set: { is_default: true }) { id } }', { id: previousDefault });
    }
  }, 60_000);

  it('should keep one subject per entry and count an entry only until it expires', async () => {
    const list = await graphql(
      'mutation ($o: watch_lists_insert_input!) { insert_watch_lists_one(object: $o) { id kind } }',
      { o: { name: `Console dev test ${crypto.randomUUID()}`, kind: 'blacklist', severity: 'high', color: '#d97706' } },
    );
    listId = String((list.insert_watch_lists_one as Row).id);
    const profile = ((await graphql('{ profiles(limit: 1, where: { erased_at: { _is_null: true }, is_blacklisted: { _eq: false } }) { id } }')).profiles as Row[])[0];
    const identity = ((await graphql('{ identities(limit: 1, where: { status: { _neq: merged } }) { id } }')).identities as Row[])[0];

    const both = await send(
      'mutation ($l: uuid!, $p: uuid!, $i: uuid!) { insert_watch_list_entries_one(object: { watch_list_id: $l, profile_id: $p, identity_id: $i }) { id } }',
      { l: listId, p: profile?.id, i: identity?.id },
    );
    expect(both.errors?.[0]?.message).toContain('watch_list_entries_exactly_one_subject');

    const entry = await graphql(
      'mutation ($l: uuid!, $p: uuid!) { insert_watch_list_entries_one(object: { watch_list_id: $l, profile_id: $p, reason: "Dev test" }) { id active added_by } }',
      { l: listId, p: profile?.id },
    );
    const row = entry.insert_watch_list_entries_one as Row;
    expect(row).toMatchObject({ active: true, added_by: me });
    expect(((await graphql('query ($id: uuid!) { profiles_by_pk(id: $id) { is_blacklisted } }', { id: profile?.id })).profiles_by_pk as Row).is_blacklisted).toBe(true);

    await graphql(
      'mutation ($id: uuid!, $at: timestamptz!) { update_watch_list_entries_by_pk(pk_columns: { id: $id }, _set: { expires_at: $at }) { id } }',
      { id: row.id, at: new Date(Date.now() - 60_000).toISOString() },
    );
    const expired = await graphql('query ($id: uuid!) { watch_list_entries(where: { id: { _eq: $id }, active: { _eq: false } }) { id } }', { id: row.id });
    expect(expired.watch_list_entries).toEqual([{ id: row.id }]);
    expect(((await graphql('query ($id: uuid!) { profiles_by_pk(id: $id) { is_blacklisted } }', { id: profile?.id })).profiles_by_pk as Row).is_blacklisted).toBe(false);
  }, 60_000);

  it('should pass the open incidents on once and show them with their status (Review Focus 5)', async () => {
    expect(other, 'a second active member in Nova').not.toBe('');
    const created = await graphql(
      'mutation ($to: uuid!) { insert_shift_handovers_one(object: { to_user_id: $to, shift_started_at: "2026-10-22T06:00:00Z", summary: "Dev test" }) { id from_user_id sent_by_me addressed_to_me } }',
      { to: other },
    );
    const handover = created.insert_shift_handovers_one as Row;
    handovers.push(String(handover.id));
    expect(handover).toMatchObject({ from_user_id: me, sent_by_me: true, addressed_to_me: false });

    const open = (
      await graphql('{ incidents_aggregate(where: { status: { _in: [open, acknowledged, investigating] } }) { aggregate { count } } }')
    ).incidents_aggregate as { aggregate: { count: number } };
    const first = await run('mutation', 'addOpenIncidentsToHandover', { handoverId: handover.id });
    expect(first).toEqual({ added: open.aggregate.count });
    expect(await run('mutation', 'addOpenIncidentsToHandover', { handoverId: handover.id })).toEqual({ added: 0 });

    const links = (
      await graphql('query ($id: uuid!) { shift_handover_incidents(where: { handover_id: { _eq: $id } }) { incident { status } } }', { id: handover.id })
    ).shift_handover_incidents as { incident: { status: string } }[];
    expect(links).toHaveLength(open.aggregate.count);
    for (const link of links) expect(ACTIVE).toContain(link.incident.status);

    // The sender cannot acknowledge their own handover.
    await expect(run('mutation', 'acknowledgeShiftHandover', { handoverId: handover.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'handover_not_recipient',
    });
  }, 60_000);

  it('should let the recipient acknowledge once and freeze the handover', async () => {
    const created = await admin(
      'mutation ($o: shift_handovers_insert_input!) { insert_shift_handovers_one(object: $o) { id } }',
      {
        o: {
          organization_id: ((await graphql('{ organizations { id } }')).organizations as Row[])[0]?.id,
          from_user_id: other,
          to_user_id: me,
          shift_started_at: '2026-10-22T06:00:00Z',
          summary: 'Dev test, for you',
        },
      },
    );
    const id = String((created.insert_shift_handovers_one as Row).id);
    handovers.push(id);

    const first = await run('mutation', 'acknowledgeShiftHandover', { handoverId: id });
    expect(typeof first.acknowledged_at).toBe('string');
    expect(await run('mutation', 'acknowledgeShiftHandover', { handoverId: id })).toEqual(first);
    await expect(run('mutation', 'addOpenIncidentsToHandover', { handoverId: id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'handover_not_sender',
    });
    await expect(run('mutation', 'addOpenIncidentsToHandover', { handoverId: crypto.randomUUID() })).rejects.toMatchObject({
      code: 'handover_not_found',
    });
  }, 60_000);

  it('should lay the page out by the newest default workspace, the previous default giving way', async () => {
    const insert = async (name: string, panels: string[]) => {
      const data = await graphql(
        'mutation ($o: operator_workspaces_insert_input!) { insert_operator_workspaces_one(object: $o) { id } }',
        { o: { name, is_default: true, layout: { panels } } },
      );
      const id = String((data.insert_operator_workspaces_one as Row).id);
      workspaces.push(id);
      return id;
    };
    const first = await insert(`Dev test A ${crypto.randomUUID()}`, ['cameras']);
    const second = await insert(`Dev test B ${crypto.randomUUID()}`, ['events', 'incidents']);
    const defaults = (await graphql('{ operator_workspaces(where: { is_default: { _eq: true } }) { id } }')).operator_workspaces as Row[];
    expect(defaults).toEqual([{ id: second }]);
    expect(first).not.toBe(second);
    expect(await run('query', 'operatorWorkspaceLayout', {})).toMatchObject({ workspace_id: second, slot1: 'events', slot2: 'incidents', slot3: '' });
  }, 60_000);
});
