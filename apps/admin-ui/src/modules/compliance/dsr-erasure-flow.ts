import { type CheckDI, type FlowConfig, type Layout, type ScreenRef, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import { DSR_DATE_CHECKS } from './dsr-dates';
import { erasureHolds } from './dsr-erasure-holds-query';
import { dsrFiled, newRequestOf, openFiled, requestFields, sending } from './dsr-create-flows';
import { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { createDataSubjectRequest } from './dsr-ops';
import { confirmsCode } from './dsr-subject-query';

const erasureFields = {
  ...requestFields,
  confirmation: f.string({
    required: true,
    texts: {
      label: 'Type the person’s code to confirm',
      doc: {
        summary:
          'The person’s profile code (such as P-00042), as the review above shows it. Erasure is irreversible: it is filed only when the code matches the chosen person.',
      },
    },
  }),
};

type ErasureValues = Readonly<Record<string, unknown>>;

/**
 * Whether the typed confirmation does NOT name the chosen person's code (the check fires). Reads
 * the person through the check's data access; an unreadable person never confirms.
 */
export async function confirmationMismatch({ values, data }: Pick<CheckDI, 'values' | 'data'>): Promise<boolean> {
  const v = values as ErasureValues;
  const profileId = v.profile_id;
  if (typeof profileId !== 'string' || profileId === '') return true;
  try {
    const { data: row } = await data.one(resourceByName(PROFILE_RESOURCE) as never, { id: profileId } as never);
    const code = (row as Readonly<Record<string, unknown>> | null | undefined)?.code;
    return !confirmsCode(v.confirmation, typeof code === 'string' ? code : null);
  } catch {
    return true;
  }
}

/**
 * Whether the legal holds the erasure would honour cannot be read (the check fires): the review
 * could not say what is kept, so nothing is filed until they can be (fail closed).
 */
export async function erasureHoldsUnknown({ values, data }: Pick<CheckDI, 'values' | 'data'>): Promise<boolean> {
  const profileId = (values as ErasureValues).profile_id;
  if (typeof profileId !== 'string' || profileId === '') return false;
  try {
    await data.query(erasureHolds, { profileId });
    return false;
  } catch {
    return true;
  }
}

/** The review reads the flow's values as its record (G35). */
const reviewProps = { profileId: ref('record', 'profile_id') as unknown as ScreenRef<'record'> };

/**
 * "Erasure request" (Review Focus 1): the person, the dates and notes; the review of what will be
 * erased and which legal holds keep part of it (partial erasure); the person's code typed as
 * confirmation, without which nothing is filed; a last confirmation. Filing starts the erasure
 * within seconds: there is no undo, so it is never resent automatically.
 */
export const newErasureRequestFlow = {
  texts: {
    label: 'Erasure request',
    confirm:
      'Erase this person’s data? Processing is restricted at once and their data is erased within a minute, except what a legal hold keeps. This cannot be undone.',
    notify: 'Request {{code}} is filed; the erasure runs in the background and its page follows it step by step.',
    doc: {
      summary:
        'Files a request to erase the person’s data (GDPR Art. 17), after a review of what goes and a typed confirmation. Irreversible; a legal hold in force keeps what it covers and the request completes as partial.',
    },
  },
  icon: NAV_ICONS.newErasureRequest,
  variant: 'destructive',
  surfaces: { list: 'regular' },
  confirm: true,
  form: {
    fields: erasureFields,
    // Empty, not absent, until chosen: the review block's prop reads the person.
    initial: { profile_id: { kind: 'literal', value: null } },
    body: (l: Layout<typeof erasureFields>) => [
      'profile_id',
      l.grid(['received_at', 'due_at']),
      'notes',
      l.place(dsrErasureReviewBlock, { key: 'erasure-form-review' }),
      'confirmation',
    ],
  },
  review: (l: Layout<typeof erasureFields>) => [l.place(dsrErasureReviewBlock, { key: 'erasure-review', props: reviewProps })],
  checks: [
    ...DSR_DATE_CHECKS,
    {
      id: 'dsrErasureConfirmation',
      severity: 'error',
      anchor: 'confirmation',
      when: confirmationMismatch,
      texts: 'The confirmation does not match the chosen person’s code: type the code shown in the review (such as P-00042).',
    },
    {
      id: 'dsrErasureHoldsUnknown',
      severity: 'error',
      anchor: 'profile_id',
      when: erasureHoldsUnknown,
      texts: 'The legal holds on this person could not be read, so what the erasure would keep is unknown. Nothing was filed; try again once they can be checked.',
    },
  ],
  submit: {
    mutation: createDataSubjectRequest,
    retry: 'never',
    input: ({ values }) => sending(newRequestOf('erasure', values)),
    onUnknown: { check: dsrFiled('erasure') },
  },
  then: openFiled,
} satisfies FlowConfig<unknown, Record<never, never>, typeof erasureFields>;
