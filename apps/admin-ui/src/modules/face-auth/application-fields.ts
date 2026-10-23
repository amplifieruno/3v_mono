import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import {
  CLIENT_APPLICATION_PLATFORMS,
  CLIENT_APPLICATION_PLATFORM_ENUM,
  CLIENT_APPLICATION_STATUSES,
  CLIENT_APPLICATION_STATUS_ENUM,
} from '../../enums/face-auth';
import { enumField } from '../../enums/field';
import { rangeValidator } from '../../fields/bounded-number';
import { checkNotBlank } from '../../fields/not-blank';

/** `client_applications_threshold_range`: every threshold is a cosine similarity from 0 to 1 (numeric(4,3)). */
export const THRESHOLD_RANGE = { min: 0, max: 1 } as const;

/** A threshold column: required, 0..1, with the database's default on create. */
function threshold(initial: number, texts: FieldTexts) {
  return f.number({
    required: true,
    min: THRESHOLD_RANGE.min,
    max: THRESHOLD_RANGE.max,
    default: initial,
    validate: rangeValidator(THRESHOLD_RANGE),
    in: ['list', 'show', 'create', 'edit'],
    texts,
  });
}

/**
 * Columns of `itap.client_applications` the `org_admin` role reads. Everything but the status is
 * edited on the form; the status changes only through Suspend, Reactivate and Revoke (revoked is
 * terminal: the guard `client_application_revoked`). Sandbox is chosen on create and never
 * changes (`client_application_sandbox_immutable`).
 */
export const clientApplicationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show', 'edit'],
    texts: { label: 'Code', doc: { summary: 'The application’s number in the organization (APP-00004), given on creation.' } },
  }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'What the application is, such as “Lobby Kiosk”; unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  platform: enumField(CLIENT_APPLICATION_PLATFORMS, CLIENT_APPLICATION_PLATFORM_ENUM, {
    required: true,
    texts: { label: 'Platform', doc: { summary: 'Where the application runs: web, Android, iOS, a server or a kiosk. Descriptive only.' } },
  }),
  status: enumField(CLIENT_APPLICATION_STATUSES, CLIENT_APPLICATION_STATUS_ENUM, {
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Active: requests are accepted. Suspended: every request is refused until it is reactivated. Revoked: retired for good. Changed with Suspend, Reactivate and Revoke.',
      },
    },
  }),
  threshold_min: threshold(0.5, {
    label: 'Minimum threshold',
    doc: { summary: 'The lowest threshold this application may be set to (0 to 1); the threshold must lie between minimum and maximum.' },
  }),
  threshold: threshold(0.6, {
    label: 'Threshold',
    doc: {
      summary:
        'The face similarity (0 to 1) a match needs. The service raises it for large populations (0.50 up to 100 people, 0.55 up to 1 000, 0.60 up to 10 000, 0.65 beyond); a request can only raise it, up to the maximum.',
    },
  }),
  threshold_max: threshold(0.9, {
    label: 'Maximum threshold',
    doc: { summary: 'The highest threshold a request may ask for (0 to 1); a higher requested value is capped here.' },
  }),
  liveness_required: f.boolean({
    default: true,
    in: ['list', 'show', 'create', 'edit'],
    texts: {
      label: 'Liveness required',
      doc: {
        summary:
          'Every capture must pass the liveness check (a still photo held up is refused); a capture whose liveness was not checked fails with Liveness failed.',
      },
    },
  }),
  use_work_schedules: f.boolean({
    default: false,
    in: ['show', 'create', 'edit'],
    texts: {
      label: 'Only people on shift',
      doc: { summary: 'Narrows the population to people whose work schedule has them on shift at the moment of the request.' },
    },
  }),
  is_sandbox: f.boolean({
    default: false,
    write: 'create',
    in: ['list', 'show', 'create', 'edit'],
    texts: {
      label: 'Sandbox',
      doc: {
        summary:
          'A test application: it authenticates only the synthetic test identities of its bound segment, never real people, binds no facilities or access points and raises no events. Chosen on creation; it never changes.',
      },
    },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who registered the application.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['list', 'show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** The columns of an applications list. */
export const CLIENT_APPLICATION_COLUMNS = [
  'code',
  'name',
  'platform',
  'status',
  'threshold',
  'liveness_required',
  'is_sandbox',
] as const;
