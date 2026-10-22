import { type FlowConfig, type FlowUnknownCheck, type Rule, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { INCIDENT_RESOURCE, SHIFT_HANDOVER_INCIDENT_RESOURCE, SHIFT_HANDOVER_RESOURCE } from '../../data/resource-names';
import { ACTIVE_STATUSES } from './incident-flows';
import { acknowledgeShiftHandover, addOpenIncidentsToHandover } from './shift-handover-ops';

type HandoverRow = Readonly<Record<string, unknown>> | undefined;

const isAcknowledged = (record: unknown): boolean => {
  const value = (record as HandoverRow)?.acknowledged_at;
  return typeof value === 'string' && value !== '';
};
const sentByMe = (record: unknown): boolean => (record as HandoverRow)?.sent_by_me === true;
const addressedToMe = (record: unknown): boolean => (record as HandoverRow)?.addressed_to_me === true;

/** The handover's flows that change it or its incidents: the sender's, until it is acknowledged. */
const SENDER_ACTIONS = ['edit', 'delete', 'add_open_incidents'];

/**
 * Who may do what, shown before anything is sent (the database's permissions and
 * `acknowledge_shift_handover` refuse the same): only the sender changes, deletes or adds incidents
 * to a handover, and only until it is acknowledged; only the recipient acknowledges it.
 */
export const SHIFT_HANDOVER_RULES: Rule[] = [
  {
    target: { kind: 'action', name: SENDER_ACTIONS },
    deny: 'run',
    when: (ctx) => isAcknowledged(ctx.record),
    fallback: 'disable',
    reason: 'The handover is acknowledged: it is the shift’s record now and no longer changes.',
  },
  {
    target: { kind: 'action', name: SENDER_ACTIONS },
    deny: 'run',
    when: (ctx) => !isAcknowledged(ctx.record) && !sentByMe(ctx.record),
    fallback: 'disable',
    reason: 'Only the operator who wrote the handover can change it.',
  },
  {
    target: { kind: 'action', name: 'acknowledge' },
    deny: 'run',
    when: (ctx) => !addressedToMe(ctx.record),
    fallback: 'disable',
    reason: 'Only the operator the shift is handed over to can acknowledge it.',
  },
];

const NOT_ACKNOWLEDGED = cond.not(cond.present(ref('record', 'acknowledged_at')));
const input = { handoverId: ref('record', 'id') };

/** Check again after a lost answer: the handover read back carries its acknowledgement. */
const acknowledgedNow: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(SHIFT_HANDOVER_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    return isAcknowledged(row) ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * Check again after a lost answer: the call went through when every incident still being handled
 * is linked to the handover now (the flow has no link count from before the call to compare, and
 * links that existed before must not read as "applied"). Some still unlinked: not applied. With no
 * incident being handled the call could add nothing, so nothing proves it ran: "not applied" lets
 * the operator run it again, which is harmless (it answers 0 added).
 */
export const incidentsLinked: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  const page = { kind: 'offset', page: 1, pageSize: 500 } as const;
  try {
    const open = await data.list(resourceByName(INCIDENT_RESOURCE) as never, {
      filter: { field: 'status', op: 'in', value: [...ACTIVE_STATUSES] },
      pagination: page,
    } as never);
    const linked = await data.list(resourceByName(SHIFT_HANDOVER_INCIDENT_RESOURCE) as never, {
      filter: { field: 'handover_id', op: 'eq', value: id },
      pagination: page,
    } as never);
    const openIds = (open.data as readonly { id?: unknown }[]).map((row) => row.id);
    const linkedIds = new Set((linked.data as readonly { incident_id?: unknown }[]).map((row) => row.incident_id));
    if (openIds.length >= 500 || linkedIds.size >= 500) return 'unknown';
    if (openIds.length === 0) return 'not-applied';
    return openIds.every((incident) => linkedIds.has(incident)) ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "Acknowledge" for the operator taking the shift over: `acknowledge_shift_handover` stamps when
 * they took it on; the handover and its incident list are frozen from then on. Idempotent.
 */
export const acknowledgeHandoverFlow = {
  texts: {
    label: 'Acknowledge',
    notify: 'Handover acknowledged: the shift is yours.',
    doc: { summary: 'Confirms you have read the handover and taken the shift over; it cannot change afterwards.' },
  },
  icon: NAV_ICONS.acknowledge,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: NOT_ACKNOWLEDGED,
  submit: {
    mutation: acknowledgeShiftHandover,
    // Idempotent: a repeat answers the acknowledged handover unchanged.
    retry: 'after-auth-refresh',
    input,
    onUnknown: { check: acknowledgedNow },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/**
 * "Add open incidents" for the sender: every incident still being handled (open, acknowledged,
 * investigating) that is not on the handover yet is linked to it, so the next operator finds
 * them on the handover with their current status (plan 05 Review Focus 5). Already linked
 * incidents are skipped, so it can be run again before handing over.
 */
export const addOpenIncidentsFlow = {
  texts: {
    label: 'Add open incidents',
    notify: 'Open incidents added to the handover: {{added}}.',
    doc: {
      summary:
        'Links every incident still being handled to the handover in one step, so the next operator sees what is pending; incidents already on it are skipped.',
    },
  },
  icon: NAV_ICONS.incidents,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: NOT_ACKNOWLEDGED,
  submit: {
    mutation: addOpenIncidentsToHandover,
    // Idempotent: a repeat skips what is linked already.
    retry: 'after-auth-refresh',
    input,
    onUnknown: { check: incidentsLinked },
  },
  then: { notify: { params: { added: ref('result', 'added') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
