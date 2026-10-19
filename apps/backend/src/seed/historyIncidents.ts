import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import type { SeedContext } from './tenancy.js';

/**
 * Operator history of the incidents the replay produced (design §9 "incidents with notes/activities"): assignment,
 * acknowledgement, investigation, notes, resolution with a disposition, closing and a manual escalation, each through
 * the real mutation functions in the session of a seeded admin (activities and audit rows come from them). Those are
 * user actions, so they run at seed time; afterwards their timestamps (incident creation, acknowledged / resolved /
 * escalated at, activities, notes) are moved to the simulated operator times after the triggering event. updated_at
 * keeps the seed time (set by trigger). Newest incidents stay open; older ones are progressively further along.
 * Idempotent: skipped once any incident has been acknowledged.
 */
type IncidentRow = { id: string; status: string; acknowledged_at: string | null; incident_events: { event_id: string }[] };
type Step =
  | { kind: 'assign' }
  | { kind: 'acknowledge' }
  | { kind: 'investigate' }
  | { kind: 'note'; body: string }
  | { kind: 'resolve'; disposition: string; resolution: string }
  | { kind: 'close' }
  | { kind: 'escalate'; reason: string };

const INCIDENTS = `
  query SeedHistoryIncidents($org: uuid!) {
    incidents(where: { organization_id: { _eq: $org } }) { id status acknowledged_at incident_events { event_id } }
  }
`;
const EVENTS = `query SeedIncidentEvents($ids: [uuid!]!) { events(where: { id: { _in: $ids } }) { id occurred_at } }`;
const ACTIVITIES = `
  query SeedIncidentActivities($id: uuid!) {
    incident_activities(where: { incident_id: { _eq: $id } }, order_by: [{ occurred_at: asc }, { created_at: asc }]) { id }
    incident_notes(where: { incident_id: { _eq: $id } }, order_by: { created_at: asc }) { id }
  }
`;

const MINUTE = 60_000;

/** Steps by target status; the oldest closed incident is a false positive. */
function stepsFor(status: string, falsePositive: boolean): Step[] {
  const note = (body: string): Step => ({ kind: 'note', body });
  switch (status) {
    case 'open':
      return [{ kind: 'escalate', reason: 'Not acknowledged within 10 minutes' }];
    case 'acknowledged':
      return [{ kind: 'assign' }, { kind: 'acknowledge' }, note('Reviewing the camera footage.')];
    case 'investigating':
      return [{ kind: 'assign' }, { kind: 'acknowledge' }, { kind: 'investigate' }, note('Footage requested from the camera operator; checking access logs.')];
    default: {
      const resolve: Step = falsePositive
        ? { kind: 'resolve', disposition: 'false_positive', resolution: 'Low-similarity match; a different person on review.' }
        : { kind: 'resolve', disposition: status === 'closed' ? 'true_positive' : 'benign', resolution: 'Verified on camera; security team informed per procedure.' };
      const steps: Step[] = [{ kind: 'assign' }, { kind: 'acknowledge' }, { kind: 'investigate' }, note('Operator verified the match on the recording.'), resolve];
      return status === 'closed' ? [...steps, { kind: 'close' }] : steps;
    }
  }
}

/** Minutes after the triggering event at which each step happens. */
const STEP_DELAY: Record<Step['kind'], [number, number]> = {
  escalate: [10, 12],
  assign: [3, 6],
  acknowledge: [6, 15],
  investigate: [20, 45],
  note: [50, 90],
  resolve: [120, 360],
  close: [1440, 1800],
};

async function runStep(actor: HasuraClient, org: string, incident: string, step: Step, assignee: string): Promise<void> {
  const call = (field: string, extra = '') =>
    actor.request(`mutation SeedIncidentStep($id: uuid!) { ${field}(args: { p_incident: $id${extra} }) { id } }`, { id: incident });
  switch (step.kind) {
    case 'assign':
      await actor.request(`mutation SeedAssign($id: uuid!, $to: uuid!) { update_incidents_by_pk(pk_columns: { id: $id }, _set: { assigned_to: $to }) { id } }`, { id: incident, to: assignee });
      return;
    case 'acknowledge':
      await call('acknowledge_incident');
      return;
    case 'investigate':
      await call('start_investigation');
      return;
    case 'close':
      await call('close_incident');
      return;
    case 'escalate':
      await call('escalate_incident', `, p_reason: ${JSON.stringify(step.reason)}`);
      return;
    case 'resolve':
      await call('resolve_incident', `, p_disposition: ${JSON.stringify(step.disposition)}, p_resolution: ${JSON.stringify(step.resolution)}`);
      return;
    case 'note':
      await actor.request(`mutation SeedNote($o: incident_notes_insert_input!) { insert_incident_notes_one(object: $o) { id } }`, {
        o: { organization_id: org, incident_id: incident, body: step.body },
      });
  }
}

/** Moves the incident's timeline to the planned times (activities in creation order: creation, then the steps). */
async function backdate(ctx: SeedContext, incident: string, opened: number, steps: Step[], times: number[]): Promise<void> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const { incident_activities: activities, incident_notes: notes } = await ctx.admin.request<{
    incident_activities: { id: string }[];
    incident_notes: { id: string }[];
  }>(ACTIVITIES, { id: incident });
  const timeline = [opened, ...times];
  const at = (kind: Step['kind']) => {
    const i = steps.findIndex((s) => s.kind === kind);
    return i < 0 ? null : iso(times[i]);
  };
  const noteTimes = steps.flatMap((s, i) => (s.kind === 'note' ? [times[i]] : []));
  const ack = at('acknowledge') ?? at('investigate') ?? at('resolve');
  const fields = activities.map((a, i) => `a${i}: update_incident_activities_by_pk(pk_columns: { id: "${a.id}" }, _set: { occurred_at: "${iso(timeline[Math.min(i, timeline.length - 1)])}", created_at: "${iso(timeline[Math.min(i, timeline.length - 1)])}" }) { id }`);
  notes.forEach((n, i) => fields.push(`n${i}: update_incident_notes_by_pk(pk_columns: { id: "${n.id}" }, _set: { created_at: "${iso(noteTimes[i] ?? opened)}" }) { id }`));
  const set: Record<string, string> = { created_at: iso(opened) };
  if (ack) set.acknowledged_at = ack;
  const resolved = at('resolve');
  if (resolved) set.resolved_at = resolved;
  const escalated = at('escalate');
  if (escalated) set.last_escalated_at = escalated;
  await ctx.admin.request(
    `mutation SeedBackdateIncident($id: uuid!, $set: incidents_set_input!) {
      incident: update_incidents_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      ${fields.join('\n')}
    }`,
    { id: incident, set },
  );
}

export async function seedIncidentHistory(
  ctx: SeedContext,
  args: { org: string; users: [string, string] },
): Promise<{ incidents: number; processed: number; byStatus: Record<string, number> }> {
  const { incidents } = await ctx.admin.request<{ incidents: IncidentRow[] }>(INCIDENTS, { org: args.org });
  const byStatus: Record<string, number> = {};
  if (incidents.length === 0 || incidents.some((i) => i.acknowledged_at !== null)) {
    return { incidents: incidents.length, processed: 0, byStatus };
  }
  const eventIds = incidents.flatMap((i) => i.incident_events.map((e) => e.event_id));
  const { events } = await ctx.admin.request<{ events: { id: string; occurred_at: string }[] }>(EVENTS, { ids: eventIds });
  const occurred = new Map(events.map((e) => [e.id, Date.parse(e.occurred_at)]));
  const opened = (i: IncidentRow) => Math.min(...i.incident_events.map((e) => occurred.get(e.event_id) ?? ctx.now.getTime()));
  const newestFirst = [...incidents].sort((a, b) => opened(b) - opened(a));
  const ladder = ['open', 'acknowledged', 'investigating', 'investigating', 'resolved', 'resolved'];
  const closed = newestFirst.slice(ladder.length);
  const actors = args.users.map((user) => createHasuraClient(ctx.env, { role: 'admin', userId: user, organizationId: args.org }));

  for (const [n, incident] of newestFirst.entries()) {
    const status = ladder[n] ?? 'closed';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const steps = stepsFor(status, incident === closed[closed.length - 1]);
    const start = opened(incident);
    const latest = ctx.now.getTime() - 5 * MINUTE;
    let previous = start;
    const times = steps.map((s, i) => {
      const [lo, hi] = STEP_DELAY[s.kind];
      const planned = start + (lo + ((n * 7 + i * 13) % (hi - lo + 1))) * MINUTE;
      previous = Math.min(Math.max(planned, previous + MINUTE), latest);
      return previous;
    });
    for (const step of steps) await runStep(actors[n % 2], args.org, incident.id, step, args.users[(n + 1) % 2]);
    await backdate(ctx, incident.id, start, steps, times);
  }
  return { incidents: incidents.length, processed: newestFirst.length, byStatus };
}
