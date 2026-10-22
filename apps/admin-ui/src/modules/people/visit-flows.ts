import { type FlowConfig, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { VISIT_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { cancelVisit, checkInVisit, checkOutVisit } from './visit-ops';

/** Check-in and cancelling are offered on a scheduled visit only, check-out on a checked-in one. */
export const SCHEDULED = cond.equals(ref('record', 'status'), 'scheduled');
export const CHECKED_IN = cond.equals(ref('record', 'status'), 'checked_in');

const checkInFields = {
  badge_number: f.string({
    nullable: true,
    texts: {
      label: 'Badge',
      doc: { summary: 'The visitor badge handed out now; left empty, the badge already on the visit is kept.' },
    },
  }),
};

/**
 * "Check in" on a scheduled visit: the badge handed out (prefilled from the visit), then
 * `check_in_visit`, which records now as the arrival. Not offered once the visit was checked in,
 * checked out, cancelled or marked no-show (the function would refuse it).
 */
export const checkInFlow = {
  texts: {
    label: 'Check in',
    notify: 'Visitor checked in.',
    doc: { summary: 'Records that the visitor arrived now, with the badge handed out.' },
  },
  icon: NAV_ICONS.checkIn,
  surfaces: { default: 'menu', show: 'auto' },
  when: SCHEDULED,
  form: { fields: checkInFields, initial: { badge_number: ref('record', 'badge_number') } },
  submit: {
    mutation: checkInVisit,
    retry: 'never',
    input: { visitId: ref('record', 'id'), badgeNumber: ref('values', 'badge_number') },
    onUnknown: { check: fieldApplied(VISIT_RESOURCE, 'status', 'checked_in') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof checkInFields>;

/** "Check out" on a checked-in visit: confirm, then `check_out_visit`, which records now as the departure. */
export const checkOutFlow = {
  texts: {
    label: 'Check out',
    confirm: 'Check the visitor out now?',
    notify: 'Visitor checked out.',
    doc: { summary: 'Records that the visitor left now; the visit becomes history.' },
  },
  icon: NAV_ICONS.checkOut,
  surfaces: { default: 'menu', show: 'auto' },
  when: CHECKED_IN,
  confirm: true,
  submit: {
    mutation: checkOutVisit,
    retry: 'never',
    input: { visitId: ref('record', 'id') },
    onUnknown: { check: fieldApplied(VISIT_RESOURCE, 'status', 'checked_out') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

const cancelFields = {
  reason: f.text({
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why the visit is called off; kept on the visit and in the audit log.' } },
  }),
};

/** "Cancel visit" on a scheduled visit: an optional reason, then `cancel_visit`. Cancelled is final. */
export const cancelFlow = {
  texts: {
    label: 'Cancel visit',
    confirm: 'Cancel this visit? A cancelled visit cannot be checked in or scheduled again.',
    notify: 'Visit cancelled.',
    doc: { summary: 'Calls the visit off before the visitor arrives; it cannot be checked in afterwards.' },
  },
  icon: NAV_ICONS.cancelVisit,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  when: SCHEDULED,
  confirm: true,
  form: { fields: cancelFields, initial: { reason: { kind: 'literal', value: null } } },
  submit: {
    mutation: cancelVisit,
    retry: 'never',
    input: { visitId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: { check: fieldApplied(VISIT_RESOURCE, 'status', 'cancelled') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof cancelFields>;
