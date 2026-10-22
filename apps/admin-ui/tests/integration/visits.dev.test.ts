import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
} from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import { visitSavedViews } from '../../src/modules/people/visit-views';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Visits against the dev stack (Nova, `org_admin`), without changing any visit: visits are never
 * deleted and their steps cannot be undone, so the test drives only what the database refuses.
 * Checking in a checked-out visit, checking out a scheduled one and cancelling a finished one are
 * definite refusals that leave the visit as it was (Review Focus 5 on the server side); a visit
 * that left scheduled cannot be updated; a visit with a visitor as host or an employee as visitor
 * is refused; the saved views' filters read.
 */

const SESSION = {
  providerId: 'hasura',
  sessionKey: 'visits-dev-test',
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

interface VisitRow {
  readonly id: string;
  readonly status: string;
  readonly visitor_profile_id: string;
  readonly host_profile_id: string | null;
  readonly checked_in_at: string | null;
  readonly checked_out_at: string | null;
  readonly updated_at: string;
}

const VISIT_COLUMNS = 'id status visitor_profile_id host_profile_id checked_in_at checked_out_at updated_at';

describe.skipIf(!DEV_STACK_ENABLED)('visits against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const byStatus = new Map<string, VisitRow>();

  const mutate = (operation: string, input: Row) => {
    const descriptor = {
      ...SESSION,
      kind: 'custom',
      ref: { namespace: 'default', id: operation },
      resource: PEOPLE_BINDING,
      operation,
      input,
    };
    return provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context());
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

  const visitById = async (id: string): Promise<VisitRow> =>
    (await graphql(`query ($id: uuid!) { visits_by_pk(id: $id) { ${VISIT_COLUMNS} } }`, { id })).visits_by_pk as VisitRow;

  /** A seeded visit in `status`; the test of that status fails when the seed has none. */
  const seeded = (status: string): VisitRow => {
    const row = byStatus.get(status);
    expect(row, `a seeded ${status} visit`).toBeDefined();
    return row as VisitRow;
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    for (const status of ['scheduled', 'checked_out', 'cancelled', 'no_show']) {
      const data = await graphql(
        `query ($s: visit_statuses_enum!) { visits(where: { status: { _eq: $s } }, order_by: { number: desc }, limit: 1) { ${VISIT_COLUMNS} } }`,
        { s: status },
      );
      const row = (data.visits as VisitRow[])[0];
      if (row !== undefined) byStatus.set(status, row);
    }
  }, 60_000);

  it('should refuse each step out of turn as a definite refusal and leave the visit as it was', async () => {
    const checkedOut = seeded('checked_out');
    await expect(mutate('checkInVisit', { visitId: checkedOut.id, badgeNumber: 'DEV' })).rejects.toMatchObject({
      kind: 'validation',
      code: 'visit_invalid_transition',
    });
    await expect(mutate('cancelVisit', { visitId: checkedOut.id, reason: 'dev test' })).rejects.toMatchObject({
      kind: 'validation',
      code: 'visit_invalid_transition',
    });
    expect(await visitById(checkedOut.id)).toEqual(checkedOut);

    for (const status of ['cancelled', 'no_show']) {
      const row = seeded(status);
      await expect(mutate('checkInVisit', { visitId: row.id })).rejects.toMatchObject({ code: 'visit_invalid_transition' });
      await expect(mutate('checkOutVisit', { visitId: row.id })).rejects.toMatchObject({ code: 'visit_invalid_transition' });
      expect(await visitById(row.id)).toEqual(row);
    }

    const scheduled = seeded('scheduled');
    await expect(mutate('checkOutVisit', { visitId: scheduled.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'visit_invalid_transition',
    });
    expect(await visitById(scheduled.id)).toEqual(scheduled);

    await expect(mutate('checkInVisit', { visitId: crypto.randomUUID() })).rejects.toMatchObject({
      kind: 'validation',
      code: 'visit_not_found',
    });
  }, 60_000);

  it('should not update a visit that left scheduled', async () => {
    const checkedOut = seeded('checked_out');
    const data = await graphql(
      'mutation ($id: uuid!) { update_visits_by_pk(pk_columns: { id: $id }, _set: { purpose: "dev test" }) { id } }',
      { id: checkedOut.id },
    );
    expect(data.update_visits_by_pk).toBeNull();
    expect(await visitById(checkedOut.id)).toEqual(checkedOut);
  }, 60_000);

  it('should refuse a visitor as host and an employee as visitor (nothing is created)', async () => {
    const scheduled = seeded('scheduled');
    const insert = (visitor: string, host: string | null) =>
      send(
        `mutation ($v: uuid!, $h: uuid) {
          insert_visits_one(object: {
            visitor_profile_id: $v, host_profile_id: $h, purpose: "dev test",
            expected_start: "2030-01-01T09:00:00Z", expected_end: "2030-01-01T10:00:00Z"
          }) { id }
        }`,
        { v: visitor, h: host },
      );
    const asHost = await insert(scheduled.visitor_profile_id, scheduled.visitor_profile_id);
    expect(asHost.errors?.[0]?.message).toContain('visit_host_is_visitor');
    expect(scheduled.host_profile_id, 'the seeded visit has a host').not.toBeNull();
    const asVisitor = await insert(String(scheduled.host_profile_id), null);
    expect(asVisitor.errors?.[0]?.message).toContain('visit_visitor_not_visitor');
    const left = await graphql('{ visits_aggregate(where: { purpose: { _eq: "dev test" } }) { aggregate { count } } }');
    expect(left.visits_aggregate).toEqual({ aggregate: { count: 0 } });
  }, 60_000);

  it('should read the saved views’ filters', async () => {
    const [today, expectedNow] = visitSavedViews(new Date());
    const value = (view: typeof today, index: number) => String(view?.state.filters[index]?.value);
    const data = await graphql(
      `query ($dayEnd: timestamptz!, $dayStart: timestamptz!, $now: timestamptz!) {
        today: visits(where: { expected_start: { _lt: $dayEnd }, expected_end: { _gte: $dayStart } }) { id }
        due: visits(where: { status: { _eq: scheduled }, expected_start: { _lte: $now }, expected_end: { _gte: $now } }) { id }
      }`,
      { dayEnd: value(today, 0), dayStart: value(today, 1), now: value(expectedNow, 1) },
    );
    expect(Array.isArray(data.today)).toBe(true);
    expect(Array.isArray(data.due)).toBe(true);
  }, 60_000);
});
