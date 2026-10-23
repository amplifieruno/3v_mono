import { type FlowCheck, type FlowConfig, type FlowUnknownCheck, type Rule, type RuleContext, cond, isRecordProbe, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { AREA_RESOURCE, EMERGENCY_OVERRIDE_RESOURCE, FACILITY_RESOURCE } from '../../data/resource-names';
import { OVERRIDE_MODES, OVERRIDE_MODE_ENUM } from '../../enums/access';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { endEmergencyOverride, startEmergencyOverride } from './override-ops';

type Row = Readonly<Record<string, unknown>> | null | undefined;

/** `emergency_overrides_justification_length`: at least this many characters once trimmed. */
export const JUSTIFICATION_MIN = 10;
/** `emergency_overrides_ends_at_window`: an override lasts at most this long. */
export const MAX_OVERRIDE_MS = 24 * 60 * 60 * 1000;

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** The instant of a date-time value, or `null`. */
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/** Whether a justification is too short for the database (trimmed, like its CHECK). */
export function justificationTooShort(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.trim().length < JUSTIFICATION_MIN;
}

/** Why an end time is refused: not after now, or more than 24 hours away; `null` when it is fine. */
export function endsAtProblem(value: unknown, now: number = Date.now()): 'past' | 'tooLate' | null {
  const at = instant(value);
  if (at === null) return null;
  if (at <= now) return 'past';
  return at > now + MAX_OVERRIDE_MS ? 'tooLate' : null;
}

/** The start form's checks, restating the table's CHECKs (the server refuses the same). */
export const START_OVERRIDE_CHECKS: FlowCheck[] = [
  {
    id: 'justificationLength',
    severity: 'error',
    anchor: 'justification',
    texts: `Give a justification of at least ${JUSTIFICATION_MIN} characters: it is kept with the override and sent to supervisors.`,
    when: ({ values }) => justificationTooShort(values.justification),
  },
  {
    id: 'endsInFuture',
    severity: 'error',
    anchor: 'ends_at',
    texts: 'The end must be in the future.',
    when: ({ values }) => endsAtProblem(values.ends_at) === 'past',
  },
  {
    id: 'endsWithin24h',
    severity: 'error',
    anchor: 'ends_at',
    texts: 'An override lasts at most 24 hours: choose an end within 24 hours from now.',
    when: ({ values }) => endsAtProblem(values.ends_at) === 'tooLate',
  },
];

/** What "Start override" last sent, for its lost-answer check (a check sees no form values, G12). */
let lastStarted: { readonly facilityId: string; readonly mode: string; readonly justification: string; readonly endsAt: string } | null = null;

/** The start's input; the end time is sent as an exact instant, which the check matches. */
export function startInput(values: Readonly<Record<string, unknown>>) {
  const endsAt = new Date(String(values.ends_at)).toISOString();
  const input = {
    facilityId: String(values.facility_id),
    mode: String(values.mode),
    justification: String(values.justification).trim(),
    endsAt,
    areaIds: Array.isArray(values.area_ids) ? values.area_ids.map(String) : [],
  };
  lastStarted = { facilityId: input.facilityId, mode: input.mode, justification: input.justification, endsAt };
  return input;
}

/** Check again after a lost "Start override": applied when the very override sent exists (no clock compared). */
export const overrideStarted: FlowUnknownCheck = async ({ data }) => {
  const sent = lastStarted;
  if (sent === null) return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(EMERGENCY_OVERRIDE_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'facility_id', op: 'eq', value: sent.facilityId },
          { field: 'mode', op: 'eq', value: sent.mode },
          { field: 'ends_at', op: 'eq', value: sent.endsAt },
          { field: 'justification', op: 'eq', value: sent.justification },
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

const startFields = {
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    texts: { label: 'Facility', doc: { summary: 'The site whose doors the override covers.' } },
  }),
  mode: enumField(OVERRIDE_MODES, OVERRIDE_MODE_ENUM, {
    required: true,
    texts: {
      label: 'Mode',
      doc: { summary: 'Lock all doors, unlock all doors, or evacuation (exits open, entries decide as usual).' },
    },
  }),
  // buro keeps chosen areas when the facility changes (no dependent-field reset); an area of
  // another facility is refused by the server (`area_not_found`, mapped) and nothing starts.
  area_ids: f.relationMany({
    to: AREA_RESOURCE,
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }],
    texts: {
      label: 'Areas',
      doc: { summary: 'Limit the override to these areas and the areas inside them; leave empty for the whole facility.' },
    },
  }),
  ends_at: dateTime({
    required: true,
    texts: { label: 'Ends', doc: { summary: 'When the doors return to their policies by themselves: at most 24 hours from now.' } },
  }),
  justification: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Justification',
      doc: { summary: 'Why the doors must be overridden (at least 10 characters): kept with the override, in the audit log and in the notification to supervisors.' },
    },
  }),
};

/**
 * "Start override" on the overrides list: a facility (the one selected in the sidebar to start
 * with), the mode, optionally areas, the end (at most 24 hours away) and a justification.
 * `start_emergency_override` starts it now; supervisors are notified, terminals told at once,
 * and its page opens with the terminals' sync state.
 */
export const startOverrideFlow = {
  texts: {
    label: 'Start override',
    notify: 'Override started: the covered doors decide by it now.',
    doc: {
      summary:
        'Locks or unlocks every door of a facility (or of some areas), or opens its exits for an evacuation, until a set end at most 24 hours away, with a justification.',
    },
  },
  icon: NAV_ICONS.startOverride,
  variant: 'destructive',
  surfaces: { list: 'regular' },
  checks: START_OVERRIDE_CHECKS,
  form: {
    fields: startFields,
    initial: { facility_id: ref('scope', 'facility') },
    body: (l) => [l.grid(['facility_id', 'mode']), 'area_ids', 'ends_at', 'justification'],
  },
  submit: {
    mutation: startEmergencyOverride,
    retry: 'never',
    input: ({ values }) => startInput(values),
    onUnknown: { check: overrideStarted },
  },
  then: { notify: true, open: { resource: EMERGENCY_OVERRIDE_RESOURCE, id: ref('result', 'id'), mode: 'show' } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof startFields>;

/** Whether an override ran out without being ended yet (the minute job closes it). */
export function overrideRanOut(record: Row, now: number = Date.now()): boolean {
  const ends = instant(record?.ends_at);
  return !present(record?.ended_at) && ends !== null && ends <= now;
}

/** Why "End now" is not offered on an override that ran out. */
export const RAN_OUT_REASON = 'The override has run out: the doors already decide by their policies again, and it is closed within a minute.';

/** "End now" is disabled once the override ran out (a rule with the reason). */
export const OVERRIDE_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'end' },
    deny: 'run',
    when: (ctx: Pick<RuleContext, 'record'>) =>
      !isRecordProbe(ctx.record) && typeof (ctx.record as Row)?.id === 'string' && overrideRanOut(ctx.record as Row),
    fallback: 'disable',
    reason: RAN_OUT_REASON,
  },
];

/** Check again after a lost "End now": applied when the override reads ended. */
export const overrideEnded: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(EMERGENCY_OVERRIDE_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    return present((row as Readonly<Record<string, unknown>>).ended_at) ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

const endFields = {
  reason: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Reason',
      doc: { summary: 'Why the override ends before its planned end: kept on the override, in the audit log and in the notification to supervisors.' },
    },
  }),
};

/**
 * "End now" on an active override: `end_emergency_override` ends it before its planned end, with
 * a reason. The doors decide by their policies again at once; terminals are told within seconds
 * (every end is an urgent change, whatever the mode) and the Terminals tab shows each
 * one picking up the end (plan 10 Review Focus 3).
 */
export const endOverrideFlow = {
  texts: {
    label: 'End now',
    notify: 'Override ended: the doors decide by their policies again. Terminals pick up the end within seconds.',
    doc: {
      summary:
        'Ends the override before its planned end, with a reason: the doors return to their policies and grants, and every terminal of the facility is told.',
    },
  },
  icon: NAV_ICONS.endOverride,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: cond.not(cond.present(ref('record', 'ended_at'))),
  form: { fields: endFields },
  submit: {
    mutation: endEmergencyOverride,
    retry: 'never',
    input: { overrideId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: { check: overrideEnded },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof endFields>;
