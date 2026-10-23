import { type FlowConfig, type FlowUnknownCheck, ref, source } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_DECISION_RESOURCE, IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { decisionTraceBlock } from './decision-trace-block';
import { checkAccess } from './grant-ops';
import { type LatestDecision, latestDecision, latestDoorDecision } from './terminal-ops';

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** What "Test access" sent per access point, for its lost-answer check. */
interface SentTest {
  /** The newest decision at the door when the dialog opened (database timestamps), or none. */
  readonly baseline: LatestDecision | null;
  readonly profileId: string | null;
  readonly identityId: string | null;
}

const sent = new Map<string, SentTest>();

/** The baseline the flow's `with` read, or `null` (no decision at the door yet, or unreadable). */
function baselineOf(source: unknown): LatestDecision | null {
  const parsed = latestDecision.nullable().safeParse((source as { readonly latest?: unknown } | null | undefined)?.latest ?? null);
  return parsed.success ? parsed.data : null;
}

/** The flow's input, remembered with the door's newest decision for {@link decisionRecorded}. */
export function testInput(accessPointId: string, values: Readonly<Record<string, unknown>>, baseline: unknown = null) {
  const profileId = present(values.profile_id) ? String(values.profile_id) : null;
  const identityId = present(values.identity_id) ? String(values.identity_id) : null;
  sent.set(accessPointId, { baseline: baselineOf(baseline), profileId, identityId });
  return { accessPointId, profileId, identityId };
}

/**
 * Check again after a lost "Test access": applied when the door has a decision about the person
 * (or face) that is not the baseline and not older than it. Both timestamps are the database's
 * (`check_access` records at its `now()`, after the baseline was committed), so the browser's
 * clock plays no part and a recorded test is never sent twice: a single-use grant is used once.
 */
export const decisionRecorded: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  const test = typeof id === 'string' ? sent.get(id) : undefined;
  if (test === undefined || typeof id !== 'string') return 'unknown';
  const who = test.profileId !== null ? { field: 'profile_id', value: test.profileId } : test.identityId !== null ? { field: 'identity_id', value: test.identityId } : null;
  const since = test.baseline;
  try {
    const { data: rows } = await data.list(resourceByName(ACCESS_DECISION_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'access_point_id', op: 'eq', value: id },
          ...(since === null ? [] : [{ field: 'decided_at', op: 'gte', value: since.decided_at }, { field: 'id', op: 'ne', value: since.id }]),
          ...(who === null ? [] : [{ field: who.field, op: 'eq', value: who.value }]),
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

const testFields = {
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    nullable: true,
    texts: { label: 'Person', doc: { summary: 'The person to test, as if their badge were presented at the door.' } },
  }),
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    nullable: true,
    texts: {
      label: 'Face',
      doc: { summary: 'Or a recognised face (identity), as if the door’s camera had seen it; a face without a profile is an unknown person.' },
    },
  }),
};

/**
 * "Test access" on an access point: `check_access` asks the engine now, as the door's terminal
 * would, for the person or face chosen, records the decision and shows it with its trace in the
 * dialog (`then.open` of the trace block; the form hosts it, so it is shown, G55 / G72). Not a dry
 * run: the decision is logged with an access event and a single-use grant that decides is used up.
 */
export const checkAccessFlow = {
  texts: {
    label: 'Test access',
    doc: {
      summary:
        'Asks the access engine now whether a person or face would pass this door, and shows the decision with how it was made. It is recorded like any decision and uses up a single-use grant.',
    },
  },
  icon: NAV_ICONS.checkAccess,
  surfaces: { default: 'menu', show: 'auto' },
  // The door's newest decision when the dialog opens: the lost-answer check's server-clock baseline.
  with: { baseline: source.query(latestDoorDecision, { accessPointId: ref('record', 'id') }) },
  checks: [
    {
      id: 'someone',
      severity: 'error',
      anchor: ['profile_id', 'identity_id'],
      texts: 'Choose a person or a face to test.',
      when: ({ values }) => !present(values.profile_id) && !present(values.identity_id),
    },
  ],
  form: {
    fields: testFields,
    body: (l) => [
      l.place(decisionTraceBlock, { key: 'test-intro', props: {} }),
      l.grid(['profile_id', 'identity_id']),
    ],
  },
  submit: {
    mutation: checkAccess,
    retry: 'never',
    input: ({ values, record, with: read }) => testInput(String(record?.id ?? ''), values, read.baseline),
    onUnknown: { check: decisionRecorded },
  },
  then: { open: { block: decisionTraceBlock, props: { decisionId: ref('result', 'id'), showDecisionLink: true } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof testFields>;
