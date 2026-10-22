import { type DataProvider, type MutationContext, createMutationDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';

/**
 * Incidents against the dev stack (Nova, `org_admin`), on an incident the test opens by hand and
 * deletes afterwards with the admin secret (the console's role never deletes an incident). A
 * second "Acknowledge" answers the incident unchanged and adds no second timeline entry (plan 05
 * Review Focus 1); each step out of turn is a definite refusal; notes and links are recorded and
 * frozen once the incident is closed; the computed "assigned to me" answers for the signed-in member.
 */

const SESSION = {
  providerId: 'hasura',
  sessionKey: 'incidents-dev-test',
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
type GraphqlBody = { data?: Row; errors?: { message: string }[] };

describe.skipIf(!DEV_STACK_ENABLED)('incidents against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let incidentId = '';

  const mutate = async (operation: string, input: Row): Promise<Row> => {
    const descriptor = {
      ...SESSION,
      kind: 'custom',
      ref: { namespace: 'default', id: operation },
      resource: MONITORING_BINDING,
      operation,
      input,
    };
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
  const send = async (query: string, variables: Row = {}) =>
    post({ Authorization: `Bearer ${await auth.getToken()}` }, query, variables);
  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await send(query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  const activities = async (): Promise<Row[]> =>
    (
      await graphql(
        'query ($id: uuid!) { incident_activities(where: { incident_id: { _eq: $id } }, order_by: { occurred_at: asc }) { kind details actor_id } }',
        { id: incidentId },
      )
    ).incident_activities as Row[];
  const acknowledgements = async () =>
    (await activities()).filter((a) => a.kind === 'status_change' && (a.details as Row).to === 'acknowledged');

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const me = (await auth.getIdentity({} as never))?.id;
    const facilities = (await graphql('{ facilities(limit: 1, order_by: { name: asc }) { id } }')).facilities as Row[];
    const data = await graphql(
      `mutation ($o: incidents_insert_input!) { insert_incidents_one(object: $o) { id status } }`,
      {
        o: {
          title: `Console dev test incident ${crypto.randomUUID()}`,
          severity: 'low',
          facility_id: facilities[0]?.id,
          assigned_to: me,
        },
      },
    );
    incidentId = String((data.insert_incidents_one as Row).id);
  }, 60_000);

  afterAll(async () => {
    if (incidentId === '') return;
    const body = await post(
      { 'x-hasura-admin-secret': devAdminSecret() },
      'mutation ($id: uuid!) { delete_incidents_by_pk(id: $id) { id } }',
      { id: incidentId },
    );
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
  }, 60_000);

  it('should list the incident under "Mine" for its assignee', async () => {
    const data = await graphql(
      'query ($id: uuid!) { incidents(where: { id: { _eq: $id }, assigned_to_me: { _eq: true } }) { id assigned_to_me } }',
      { id: incidentId },
    );
    expect(data.incidents).toEqual([{ id: incidentId, assigned_to_me: true }]);
  }, 30_000);

  it('should answer a second Acknowledge unchanged, with one timeline entry (Review Focus 1)', async () => {
    const first = await mutate('acknowledgeIncident', { incidentId });
    expect(first).toMatchObject({ id: incidentId, status: 'acknowledged' });
    expect(String(first.acknowledged_by_name)).not.toBe('nobody yet');
    const before = (await graphql('query ($id: uuid!) { incidents_by_pk(id: $id) { acknowledged_at } }', { id: incidentId }))
      .incidents_by_pk as Row;

    // A stale page acknowledges again: the same incident comes back, nothing is written twice.
    const second = await mutate('acknowledgeIncident', { incidentId });
    expect(second).toEqual(first);
    const after = (await graphql('query ($id: uuid!) { incidents_by_pk(id: $id) { acknowledged_at } }', { id: incidentId }))
      .incidents_by_pk as Row;
    expect(after.acknowledged_at).toBe(before.acknowledged_at);
    expect(await acknowledgements()).toHaveLength(1);
  }, 60_000);

  it('should run the lifecycle, refuse steps out of turn and freeze a closed incident', async () => {
    expect(await mutate('startInvestigation', { incidentId })).toMatchObject({ status: 'investigating' });
    // Once investigated, a late Acknowledge is a definite refusal (the button is gone, a stale page gets this).
    await expect(mutate('acknowledgeIncident', { incidentId })).rejects.toMatchObject({
      kind: 'validation',
      code: 'incident_invalid_transition',
    });
    await expect(mutate('closeIncident', { incidentId })).rejects.toMatchObject({ code: 'incident_invalid_transition' });

    // A note, a linked event and a person; the note is in the timeline with its author.
    const note = await graphql(
      'mutation ($id: uuid!) { insert_incident_notes_one(object: { incident_id: $id, body: "Checked the lobby camera." }) { id author_id } }',
      { id: incidentId },
    );
    const noteRow = note.insert_incident_notes_one as Row;
    const events = (await graphql('{ events(limit: 1, order_by: { occurred_at: desc }) { id } }')).events as Row[];
    const identities = (await graphql('{ identities(limit: 1) { id } }')).identities as Row[];
    await graphql('mutation ($i: uuid!, $e: uuid!) { insert_incident_events_one(object: { incident_id: $i, event_id: $e }) { id } }', {
      i: incidentId,
      e: events[0]?.id,
    });
    await graphql(
      'mutation ($i: uuid!, $p: uuid!) { insert_incident_identities_one(object: { incident_id: $i, identity_id: $p, role: witness }) { id } }',
      { i: incidentId, p: identities[0]?.id },
    );
    expect((await activities()).find((a) => a.kind === 'note')).toMatchObject({
      actor_id: noteRow.author_id,
      details: { note_id: noteRow.id },
    });

    // Escalate by hand with a reason (no policy: the step count goes up).
    expect(await mutate('escalateIncident', { incidentId, reason: 'Dev test' })).toMatchObject({ status: 'investigating' });
    expect((await activities()).find((a) => a.kind === 'escalated')).toMatchObject({
      details: { step: 1, manual: true, reason: 'Dev test' },
    });

    // Resolve, then neither escalate nor investigate past close.
    expect(await mutate('resolveIncident', { incidentId, disposition: 'benign', resolution: 'Expected visitor.' })).toMatchObject({
      status: 'resolved',
    });
    await expect(mutate('escalateIncident', { incidentId })).rejects.toMatchObject({
      kind: 'validation',
      code: 'incident_not_active',
    });
    expect(await mutate('closeIncident', { incidentId })).toMatchObject({ status: 'closed' });
    await expect(mutate('startInvestigation', { incidentId })).rejects.toMatchObject({ code: 'incident_invalid_transition' });

    // Closed is final: no edit, no new note.
    const edit = await graphql('mutation ($id: uuid!) { update_incidents_by_pk(pk_columns: { id: $id }, _set: { title: "Changed" }) { id } }', {
      id: incidentId,
    });
    expect(edit.update_incidents_by_pk).toBeNull();
    const late = await send(
      'mutation ($id: uuid!) { insert_incident_notes_one(object: { incident_id: $id, body: "Too late." }) { id } }',
      { id: incidentId },
    );
    expect(late.errors?.[0]?.message).toBeDefined();

    // The timeline holds each status change once, in order.
    const changes = (await activities()).filter((a) => a.kind === 'status_change').map((a) => (a.details as Row).to);
    expect(changes).toEqual(['open', 'acknowledged', 'investigating', 'resolved', 'closed']);
  }, 120_000);

  it('should refuse a report of an incident that does not exist', async () => {
    await expect(mutate('generateIncidentReport', { incidentId: crypto.randomUUID(), format: 'pdf' })).rejects.toMatchObject({
      kind: 'validation',
      code: 'incident_not_found',
    });
  }, 30_000);
});
