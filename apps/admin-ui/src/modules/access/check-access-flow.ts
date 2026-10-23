import { type FlowConfig, type FlowUnknownCheck, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_DECISION_RESOURCE, IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { decisionTraceBlock } from './decision-trace-block';
import { checkAccess } from './grant-ops';

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** What "Test access" sent per access point, for its lost-answer check. */
interface SentTest {
  readonly sentAt: string;
  readonly profileId: string | null;
  readonly identityId: string | null;
}

const sent = new Map<string, SentTest>();

/** The flow's input, remembered for {@link decisionRecorded}. */
export function testInput(accessPointId: string, values: Readonly<Record<string, unknown>>) {
  const profileId = present(values.profile_id) ? String(values.profile_id) : null;
  const identityId = present(values.identity_id) ? String(values.identity_id) : null;
  sent.set(accessPointId, { sentAt: new Date(Date.now() - 1000).toISOString(), profileId, identityId });
  return { accessPointId, profileId, identityId };
}

/**
 * Check again after a lost "Test access": applied when the access point has a decision about the
 * person (or face) since the test was sent. `check_access` records at the database's `now()`.
 */
export const decisionRecorded: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  const test = typeof id === 'string' ? sent.get(id) : undefined;
  if (test === undefined || typeof id !== 'string') return 'unknown';
  const who = test.profileId !== null ? { field: 'profile_id', value: test.profileId } : test.identityId !== null ? { field: 'identity_id', value: test.identityId } : null;
  try {
    const { data: rows } = await data.list(resourceByName(ACCESS_DECISION_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'access_point_id', op: 'eq', value: id },
          { field: 'decided_at', op: 'gte', value: test.sentAt },
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
    input: ({ values, record }) => testInput(String(record?.id ?? ''), values),
    onUnknown: { check: decisionRecorded },
  },
  then: { open: { block: decisionTraceBlock, props: { decisionId: ref('result', 'id'), showDecisionLink: true } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof testFields>;
