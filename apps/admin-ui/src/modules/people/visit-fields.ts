import type { Check } from '@burojs/core';
import { f } from '@burojs/field-types';
import { COMPANY_RESOURCE, FACILITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { instantOf } from '../../fields/date-time-format';
import { VISIT_STATUSES, VISIT_STATUS_ENUM } from '../../enums/visits';

/**
 * Columns of `itap.visits` the `org_admin` role reads (`organization_id` and `number` left out:
 * `code` carries the number). Status, check-in/out times and the cancellation reason change only
 * through `check_in_visit`, `check_out_visit`, `cancel_visit` and the daily no-show job.
 */
export const visitFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Code', doc: { summary: 'The visit’s number as staff read it out, for example `VISIT-00042`.' } },
  }),
  visitor_profile_id: f.relation({
    to: PROFILE_RESOURCE,
    required: true,
    open: 'page',
    // The database refuses any other profile type as the visitor (`visit_visitor_not_visitor`).
    candidates: [{ field: 'profile_type', op: 'eq', value: 'visitor' }],
    texts: {
      label: 'Visitor',
      doc: {
        summary:
          'The visitor’s profile (type Visitor); the picker shows last names. Create the visitor’s profile first when they are new.',
      },
    },
  }),
  host_profile_id: f.relation({
    to: PROFILE_RESOURCE,
    nullable: true,
    open: 'page',
    // A visitor cannot host a visit (`visit_host_is_visitor`): employees, contractors and VIPs can.
    candidates: [{ field: 'profile_type', op: 'ne', value: 'visitor' }],
    texts: {
      label: 'Host',
      doc: { summary: 'The person the visitor comes to see: an employee, contractor or VIP, never another visitor.' },
    },
  }),
  company_id: f.relation({
    to: COMPANY_RESOURCE,
    nullable: true,
    open: 'page',
    texts: {
      label: 'Company',
      doc: { summary: 'The company the visit is for, usually the host’s tenant; the company page lists its visits.' },
    },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    open: 'page',
    texts: {
      label: 'Facility',
      doc: {
        summary:
          'Where the visitor is expected. Left empty, the visit counts for every facility: the visitor seen at any of them is linked to it.',
      },
    },
  }),
  purpose: f.text({
    nullable: true,
    texts: { label: 'Purpose', doc: { summary: 'Why the visitor comes, for example an interview or a delivery.' } },
  }),
  expected_start: dateTime({
    required: true,
    texts: { label: 'Expected from', doc: { summary: 'When the visitor is expected to arrive.' } },
  }),
  expected_end: dateTime({
    required: true,
    texts: {
      label: 'Expected until',
      doc: {
        summary:
          'When the visit should be over; a visit still scheduled after this is marked No-show by the daily lifecycle job.',
      },
    },
  }),
  status: enumField(VISIT_STATUSES, VISIT_STATUS_ENUM, {
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Scheduled until the visitor is checked in, then Checked in and Checked out; Cancelled or No-show when they never came.',
      },
    },
  }),
  badge_number: f.string({
    nullable: true,
    texts: {
      label: 'Badge',
      doc: { summary: 'The visitor badge handed out, if any; it can also be given at check-in.' },
    },
  }),
  checked_in_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Checked in', doc: { summary: 'When reception checked the visitor in.' } },
  }),
  checked_out_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Checked out', doc: { summary: 'When reception checked the visitor out.' } },
  }),
  cancellation_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Cancellation reason', doc: { summary: 'Why the visit was cancelled, as given when cancelling.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** `expected_end > expected_start` (`visits_expected_range`), refused before any request. */
export const VISIT_CHECKS: Check[] = [
  {
    id: 'visitWindowOrdered',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'expected_end',
    texts: 'The visit must end after it starts.',
    when: ({ values }) => {
      const start = instantOf(values.expected_start);
      const end = instantOf(values.expected_end);
      return start !== null && end !== null && end <= start;
    },
  },
];
