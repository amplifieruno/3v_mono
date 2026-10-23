import { type Rule, type RuleContext, defineResource, isRecordProbe } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  FACILITY_RESOURCE,
  IDENTITY_RESOURCE,
  INCIDENT_RESOURCE,
  LEGAL_HOLD_FACILITY_TARGET_RESOURCE,
  LEGAL_HOLD_IDENTITY_TARGET_RESOURCE,
  LEGAL_HOLD_INCIDENT_TARGET_RESOURCE,
  LEGAL_HOLD_PROFILE_TARGET_RESOURCE,
  LEGAL_HOLD_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { holdActive } from './legal-hold-rules';

type Row = Readonly<Record<string, unknown>> | null | undefined;

/** One kind of hold target: the twin resource over `itap.legal_hold_targets` that sets only its column (G45). */
export interface HoldTargetSpec {
  readonly resource: string;
  readonly column: 'profile_id' | 'identity_id' | 'incident_id' | 'facility_id';
  readonly to: string;
  readonly label: string;
  readonly labelPlural: string;
  readonly summary: string;
  readonly title: string;
}

export const HOLD_TARGETS: readonly HoldTargetSpec[] = [
  {
    resource: LEGAL_HOLD_PROFILE_TARGET_RESOURCE,
    column: 'profile_id',
    to: PROFILE_RESOURCE,
    label: 'Held person',
    labelPlural: 'Held people',
    summary: 'A person the hold covers: their profile, every identity linked to it (and merged into it), and every row about them.',
    title: 'People',
  },
  {
    resource: LEGAL_HOLD_IDENTITY_TARGET_RESOURCE,
    column: 'identity_id',
    to: IDENTITY_RESOURCE,
    label: 'Held identity',
    labelPlural: 'Held identities',
    summary: 'A tracked face the hold covers, with the profile it is linked to and every row about it, such as an unknown face seen at an incident.',
    title: 'Identities',
  },
  {
    resource: LEGAL_HOLD_INCIDENT_TARGET_RESOURCE,
    column: 'incident_id',
    to: INCIDENT_RESOURCE,
    label: 'Held incident',
    labelPlural: 'Held incidents',
    summary: 'An incident the hold covers, with its notes, activities, linked events and reports.',
    title: 'Incidents',
  },
  {
    resource: LEGAL_HOLD_FACILITY_TARGET_RESOURCE,
    column: 'facility_id',
    to: FACILITY_RESOURCE,
    label: 'Held facility',
    labelPlural: 'Held facilities',
    summary: 'A facility the hold covers: every row recorded there (detections, events, sessions, decisions, statistics).',
    title: 'Facilities',
  },
];

/** The hold of a target row, as `hold { starts_at ends_at }` reads it with the row. */
const holdOf = (ctx: Pick<RuleContext, 'record'>): Row => {
  if (isRecordProbe(ctx.record)) return null;
  const hold = (ctx.record as Row)?.hold;
  return typeof hold === 'object' && hold !== null ? (hold as Row) : null;
};

/** Why a target of a hold in force is not removed. */
export const TARGET_HELD_REASON = 'The hold is in force: what it covers stays covered until the hold ends (end it first).';

/** A target of a hold in force cannot be removed (`legal_hold_active`): Delete is disabled with the reason. */
export const HOLD_TARGET_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'delete' },
    deny: 'run',
    when: (ctx) => holdActive(holdOf(ctx)),
    fallback: 'disable',
    reason: TARGET_HELD_REASON,
  },
];

/** The fields of one twin: the hold and its own target column, both required and chosen once. */
export function holdTargetFields(spec: HoldTargetSpec) {
  return {
    id: f.uuid({ system: true, texts: 'ID', in: [] }),
    hold_id: f.relation({
      to: LEGAL_HOLD_RESOURCE,
      required: true,
      write: 'create',
      open: 'page',
      texts: { label: 'Legal hold', doc: { summary: 'The hold that covers this target.' } },
    }),
    [spec.column]: f.relation({
      to: spec.to,
      required: true,
      write: 'create',
      open: 'page',
      texts: { label: spec.label, doc: { summary: spec.summary } },
    }),
    created_at: f.dateTime({ system: true, in: ['list'], texts: { label: 'Added', doc: { summary: 'When the target was added to the hold.' } } }),
  };
}

function holdTargetResource(spec: HoldTargetSpec) {
  return defineResource(spec.resource, {
    texts: { label: spec.label, labelPlural: spec.labelPlural, doc: { summary: spec.summary } },
    basePath: `/legal-hold-${spec.column.replace('_id', '')}-targets`,
    displayField: spec.column,
    data: { provider: 'hasura' },
    operations: { edit: false },
    builtinActions: { edit: false },
    fields: holdTargetFields(spec),
    rules: HOLD_TARGET_RULES,
    views: {
      list: { page: false, columns: [spec.column, 'created_at'] },
      show: { page: false },
      create: { body: () => ['hold_id', spec.column] },
    },
  });
}

/** The four twins, in the order of {@link HOLD_TARGETS}. */
export const HOLD_TARGET_RESOURCES = HOLD_TARGETS.map(holdTargetResource);
