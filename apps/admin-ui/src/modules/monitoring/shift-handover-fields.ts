import type { Check } from '@burojs/core';
import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';

/**
 * Columns of `itap.shift_handovers` the `org_admin` role reads. The sender (`from_user_id`) is
 * stamped from the session; `acknowledged_at` is set by the recipient's "Acknowledge" only.
 */
export const shiftHandoverFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  from_user_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'From', doc: { summary: 'The operator handing the shift over: whoever wrote the handover.' } },
  }),
  to_user_id: f.relation({
    to: USER_RESOURCE,
    required: true,
    open: 'none',
    texts: {
      label: 'To',
      doc: { summary: 'The operator taking the shift over: an active member other than you. Only they can acknowledge it.' },
    },
  }),
  shift_started_at: dateTime({
    required: true,
    texts: { label: 'Shift started', doc: { summary: 'When the shift being handed over began.' } },
  }),
  shift_ended_at: dateTime({
    texts: { label: 'Shift ended', doc: { summary: 'When it ended; empty while it is still running. Not before the start.' } },
  }),
  summary: f.text({
    nullable: true,
    texts: {
      label: 'Summary',
      doc: { summary: 'What the next operator needs to know: what happened, what is pending, what to watch.' },
    },
  }),
  acknowledged_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Acknowledged',
      doc: { summary: 'When the recipient confirmed taking the shift over; the handover is frozen from then on.' },
    },
  }),
  addressed_to_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'For me', doc: { summary: 'Whether you are the operator taking the shift over.' } },
  }),
  sent_by_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'Sent by me', doc: { summary: 'Whether you wrote the handover (only its sender changes it).' } },
  }),
  created_at: dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Written', doc: { summary: 'When the handover was written.' } } }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** `shift_ended_at >= shift_started_at` (`shift_handovers_times_ordered`); ISO instants compare as dates. */
export const SHIFT_HANDOVER_CHECKS: Check[] = [
  {
    id: 'shiftTimesOrdered',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'shift_ended_at',
    texts: 'The shift cannot end before it started.',
    when: ({ values }) => {
      const start = values.shift_started_at;
      const end = values.shift_ended_at;
      return (
        typeof start === 'string' && typeof end === 'string' && start !== '' && end !== '' && Date.parse(end) < Date.parse(start)
      );
    },
  },
];

/** The handover list's views: what an operator coming on shift looks for first. */
export const SHIFT_HANDOVER_SAVED_VIEWS = [
  {
    id: 'waiting-for-me',
    texts: 'Waiting for me',
    state: {
      filters: [
        { field: 'addressed_to_me', op: 'eq', value: true },
        { field: 'acknowledged_at', op: 'isNull' },
      ],
    },
  },
  { id: 'for-me', texts: 'For me', state: { filters: [{ field: 'addressed_to_me', op: 'eq', value: true }] } },
  { id: 'sent-by-me', texts: 'Sent by me', state: { filters: [{ field: 'sent_by_me', op: 'eq', value: true }] } },
  { id: 'unacknowledged', texts: 'Unacknowledged', state: { filters: [{ field: 'acknowledged_at', op: 'isNull' }] } },
];
