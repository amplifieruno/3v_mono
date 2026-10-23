import { f } from '@burojs/field-types';
import { PROFILE_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { DSR_STATUSES, DSR_STATUS_ENUM, DSR_TYPES, DSR_TYPE_ENUM } from '../../enums/compliance-records';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { storageFile } from '../../fields/storage-file';

/** `storage.files.metadata.kind` of an access / portability bundle: sensitive, opened through `open_file` only. */
export const DSR_EXPORT_KIND = 'dsr_export';

const shown = ['list', 'show'] as const;

/**
 * Columns of `itap.data_subject_requests` the `org_admin` role reads. Subject, type, receipt,
 * due date, details and notes are filed by the "new request" flows; only the notes are edited
 * afterwards. Status, completion, outcome, rejection, the bundle and the job's columns are
 * written by the background job and the closing functions (read-only here).
 */
export const dsrFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The request’s reference (DSR-00012), numbered per organization; quote it to the person.' } },
  }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Person',
      doc: { summary: 'The profile of the person the request is about (the data subject). Fixed once filed; an erased person is shown as "Erased subject".' },
    },
  }),
  request_type: enumField(DSR_TYPES, DSR_TYPE_ENUM, {
    system: true,
    texts: { label: 'Type', doc: { summary: 'The right the person exercises: access, portability, erasure, restriction or rectification. Chosen by the "new request" button used.' } },
  }),
  status: enumField(DSR_STATUSES, DSR_STATUS_ENUM, {
    system: true,
    texts: { label: 'Status', doc: { summary: 'Received, in progress, completed or rejected; moved on by the background job and the Reject and Complete actions.' } },
  }),
  received_at: dateTime({
    system: true,
    texts: { label: 'Received', doc: { summary: 'When the request reached the organization; the deadline counts from here. Never in the future.' } },
  }),
  due_at: dateTime({
    system: true,
    texts: {
      label: 'Due',
      doc: { summary: 'The deadline for the answer: 30 days after receipt when left empty, at most 90 days after it (an extension for complex requests).' },
    },
  }),
  completed_at: dateTime({ system: true, in: [...shown], texts: { label: 'Closed', doc: { summary: 'When the request was completed or rejected.' } } }),
  partial: f.boolean({
    system: true,
    in: [...shown],
    texts: {
      label: 'Partial',
      doc: { summary: 'An erasure that kept some data because a legal hold covered it (GDPR Art. 17(3)(e)); the steps name what was kept and which holds kept it.' },
    },
  }),
  details: f.json({
    system: true,
    in: ['show'],
    texts: { label: 'Requested', doc: { summary: 'What the person asked for, as filed (a rectification’s requested changes); never changed afterwards.' } },
  }),
  notes: f.text({
    nullable: true,
    in: ['show', 'create', 'edit'],
    texts: { label: 'Notes', doc: { summary: 'Internal notes: how the request arrived, how the identity was verified. The only column edited after filing.' } },
  }),
  outcome: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Outcome', doc: { summary: 'What was corrected, written when a rectification is completed.' } },
  }),
  rejection_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Rejection reason', doc: { summary: 'Why the request was rejected, as told to the person (subject_not_found: the profile no longer exists).' } },
  }),
  export_file_id: storageFile({
    bucket: 'organization',
    kind: DSR_EXPORT_KIND,
    sensitive: true,
    displayOnly: true,
    in: ['show'],
    texts: {
      label: 'Bundle',
      doc: { summary: 'The zip with the person’s data (bundle.json and their files) of a completed access or portability request; every opening is audited.' },
    },
  }),
  requested_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Filed by', doc: { summary: 'The member who filed the request.' } },
  }),
  attempts: f.number({ system: true, in: ['show'], texts: { label: 'Attempts', doc: { summary: 'How many times the background job has picked the request up.' } } }),
  last_error: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Last error', doc: { summary: 'Why the last attempt failed; max_attempts means the job gave up after 5 attempts until someone retries.' } },
  }),
  lease_expires_at: dateTime({
    system: true,
    in: [],
    texts: { label: 'Lease', doc: { summary: 'Until when the current attempt holds the request; empty while nothing works on it.' } },
  }),
  overdue_notified_at: dateTime({
    system: true,
    in: ['show'],
    texts: { label: 'Reported overdue', doc: { summary: 'When the request was reported overdue (a dsr_overdue event, at most 10 minutes after the due date passed).' } },
  }),
  created_at: f.dateTime({ system: true, in: ['show'], texts: { label: 'Filed', doc: { summary: 'When the request was filed in the console.' } } }),
};

/** The columns of a requests list. */
export const DSR_COLUMNS = ['code', 'request_type', 'profile_id', 'status', 'received_at', 'due_at', 'completed_at', 'partial'] as const;
