import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { escalationFields } from './historyNotifications.js';
import { escalationTimes } from './notificationPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Operator history of the incidents the replay produced (incidents themselves open at their event time) (design §9 "incidents with notes/activities"): assignment,
 * acknowledgement, investigation, notes, resolution with a disposition, closing and a manual escalation, each through
 * the real mutation functions in the session of a seeded admin (activities and audit rows come from them). Those are
 * user actions, so they run at seed time; afterwards their timestamps (incident creation, acknowledged / resolved /
 * escalated at, later activities, notes) are moved to the simulated operator times after the triggering event. updated_at
 * keeps the seed time (set by trigger). Newest incidents stay open; older ones are progressively further along.
 * Idempotent: skipped once any incident has been acknowledged.
 *
 * Escalation (slice 5): incidents of the escalating rule get the escalation policy together with their automatic
 * escalations at the simulated cron instants before their acknowledgement (notificationPlan.escalationTimes), in the
 * acknowledgement's transaction, so the live escalate cron never sees one unacknowledged under a policy. The newest
 * critical one (not the false-positive persona) stays open as the live demo: its first pass is history, then a second
 * cycle's steps 1-2 at 7 and 6 minutes before the request, so its on-call step is due about 4 minutes later and the
 * policy keeps repeating until someone acknowledges it (the intermediate cycles are not simulated). Other occurrences
 * then start at 'acknowledged' on the status ladder.
 */
type IncidentRow = {
  id: string;
  status: string;
  severity: string;
  created_at: string;
  dedup_key: string | null;
  acknowledged_at: string | null;
  incident_identities: { identity_id: string }[];
};
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
    incidents(where: { organization_id: { _eq: $org } }) {
      id status severity created_at dedup_key acknowledged_at incident_identities { identity_id }
    }
  }
`;
const ACTIVITIES = `
  query SeedIncidentActivities($id: uuid!) {
    incident_activities(
      where: { incident_id: { _eq: $id }, _not: { kind: { _eq: escalated }, actor_id: { _is_null: true } } }
      order_by: [{ occurred_at: asc }, { created_at: asc }]
    ) { id }
    incident_notes(where: { incident_id: { _eq: $id } }, order_by: { created_at: asc }) { id }
  }
`;

const MINUTE = 60_000;

/** Steps by target status; `falsePositive` resolves (and closes, when closed) as a false positive. */
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

/** `before`: fields run first in the same request (the escalations before an acknowledgement). */
async function runStep(actor: HasuraClient, org: string, incident: string, step: Step, assignee: string, before: string[] = []): Promise<void> {
  const call = (field: string, extra = '') =>
    actor.request(`mutation SeedIncidentStep($id: uuid!) { ${before.join('\n')} ${field}(args: { p_incident: $id${extra} }) { id } }`, { id: incident });
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
  // The creation activity (index 0) is already dated at the incident's created_at (= event time).
  const fields = activities.slice(1).map((a, j) => {
    const time = iso(timeline[Math.min(j + 1, timeline.length - 1)]);
    return `a${j}: update_incident_activities_by_pk(pk_columns: { id: "${a.id}" }, _set: { occurred_at: "${time}", created_at: "${time}" }) { id }`;
  });
  notes.forEach((n, i) => fields.push(`n${i}: update_incident_notes_by_pk(pk_columns: { id: "${n.id}" }, _set: { created_at: "${iso(noteTimes[i] ?? opened)}" }) { id }`));
  const set: Record<string, string> = {};
  if (ack) set.acknowledged_at = ack;
  const resolved = at('resolve');
  if (resolved) set.resolved_at = resolved;
  const escalated = at('escalate');
  if (escalated) set.last_escalated_at = escalated;
  // An escalating open incident has no operator steps: nothing to move.
  if (Object.keys(set).length === 0 && fields.length === 0) return;
  await ctx.admin.request(
    `mutation SeedBackdateIncident($id: uuid!, $set: incidents_set_input!) {
      incident: update_incidents_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      ${fields.join('\n')}
    }`,
    { id: incident, set },
  );
}

/** Occurrence of an incident: its session (one sighting can open incidents of several rules), else itself. */
function occurrence(i: IncidentRow): string {
  const m = /^session:([^:]+):/.exec(i.dedup_key ?? '');
  return m ? m[1] : i.id;
}

export async function seedIncidentHistory(
  ctx: SeedContext,
  args: {
    org: string;
    users: [string, string];
    falsePositiveIdentity: string | null;
    /** The rule whose incidents escalate under the policy (incident dedup keys end with `:rule:<id>`). */
    escalation: { ruleId: string; policyId: string } | null;
  },
): Promise<{ incidents: number; processed: number; byStatus: Record<string, number>; escalations: number; demoIncident: string | null }> {
  const { incidents } = await ctx.admin.request<{ incidents: IncidentRow[] }>(INCIDENTS, { org: args.org });
  const byStatus: Record<string, number> = {};
  if (incidents.length === 0 || incidents.some((i) => i.acknowledged_at !== null)) {
    return { incidents: incidents.length, processed: 0, byStatus, escalations: 0, demoIncident: null };
  }
  const opened = (i: IncidentRow) => Date.parse(i.created_at);
  // The watch-list persona's earliest incident turned out to be a false positive.
  const persona = incidents
    .filter((i) => args.falsePositiveIdentity && i.incident_identities.some((x) => x.identity_id === args.falsePositiveIdentity))
    .sort((a, b) => opened(a) - opened(b))[0];
  const escalation = args.escalation;
  const escalates = (i: IncidentRow) => escalation !== null && (i.dedup_key ?? '').endsWith(`:rule:${escalation.ruleId}`);
  const demo = incidents
    .filter((i) => escalates(i) && i.severity === 'critical' && i !== persona)
    .sort((a, b) => opened(b) - opened(a))[0];
  const demoOccurrence = demo ? occurrence(demo) : null;
  // Statuses per occurrence, newest first: the latest still open (or the demo incident), older ones further along.
  const occurrences = [...new Set([...incidents].sort((a, b) => opened(b) - opened(a)).map(occurrence))].filter((o) => o !== demoOccurrence);
  const ladder = demo ? ['acknowledged', 'investigating', 'resolved'] : ['open', 'acknowledged', 'investigating', 'resolved'];
  let escalations = 0;
  const actors = args.users.map((user) => createHasuraClient(ctx.env, { role: 'admin', userId: user, organizationId: args.org }));

  const ordered = [...incidents].sort((a, b) => opened(b) - opened(a) || a.id.localeCompare(b.id));
  for (const [n, incident] of ordered.entries()) {
    const rank = occurrence(incident) === demoOccurrence ? -1 : occurrences.indexOf(occurrence(incident));
    let status = rank < 0 ? 'open' : (ladder[rank] ?? 'closed');
    const falsePositive = incident === persona;
    if (falsePositive) status = 'resolved';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    // Escalating incidents escalate automatically instead of the manual escalation of an open incident.
    const steps = escalates(incident) && status === 'open' ? [] : stepsFor(status, falsePositive);
    const start = opened(incident);
    const latest = ctx.now.getTime() - 5 * MINUTE;
    let previous = start;
    const times = steps.map((s, i) => {
      const [lo, hi] = STEP_DELAY[s.kind];
      const planned = start + (lo + ((n * 7 + i * 13) % (hi - lo + 1))) * MINUTE;
      previous = Math.min(Math.max(planned, previous + MINUTE), latest);
      return previous;
    });
    const actor = actors[rank % 2 === 0 ? 0 : 1];
    const ackIndex = steps.findIndex((s) => s.kind === 'acknowledge');
    let escalateAt: number[] = [];
    if (escalation && escalates(incident)) {
      escalateAt = escalationTimes(start, ackIndex < 0 ? null : times[ackIndex]).filter((t) => t <= latest);
      if (incident === demo) escalateAt.push(Date.now() - 7 * MINUTE, Date.now() - 6 * MINUTE);
      escalations += escalateAt.length;
    }
    const escalate = escalation
      ? escalationFields({ org: args.org, incident: incident.id, policy: escalation.policyId, times: escalateAt, until: Date.now() })
      : [];
    for (const [i, step] of steps.entries()) {
      await runStep(actor, args.org, incident.id, step, args.users[rank % 2 === 0 ? 1 : 0], i === ackIndex ? escalate : []);
    }
    if (ackIndex < 0 && escalate.length > 0) await actor.request(`mutation SeedIncidentEscalations { ${escalate.join('\n')} }`);
    await backdate(ctx, incident.id, start, steps, times);
  }
  return { incidents: incidents.length, processed: ordered.length, byStatus, escalations, demoIncident: demo?.id ?? null };
}
