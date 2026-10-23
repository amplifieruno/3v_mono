import type { FlowConfig, FlowUnknownCheck } from '@burojs/core';
import { ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { endLegalHold } from './legal-hold-ops';
import { holdEnded } from './legal-hold-rules';

/** Check again after a lost "End now": applied when the hold reads ended. */
export const holdEndedApplied: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(LEGAL_HOLD_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    return holdEnded(row as Readonly<Record<string, unknown>>) ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "End now" on a hold in force (from the "More" menu, where a confirm-only flow keeps its toast,
 * G72): its end becomes now. From then on retention and erasure treat what it covered like any
 * other data, and its dates are frozen.
 */
export const endHoldFlow = {
  texts: {
    label: 'End now',
    confirm:
      'End this hold now? From the next nightly run, what it covered is purged like any other data past its retention, and an erasure request is no longer partial because of it. An ended hold cannot be reactivated.',
    notify: 'The legal hold has ended.',
    doc: {
      summary:
        'Ends the hold at once. Its dates are frozen afterwards; to protect the data again, create a new hold.',
    },
  },
  icon: NAV_ICONS.endHold,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  confirm: true,
  submit: {
    mutation: endLegalHold,
    retry: 'after-auth-refresh',
    input: { holdId: ref('record', 'id') },
    onUnknown: { check: holdEndedApplied },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
