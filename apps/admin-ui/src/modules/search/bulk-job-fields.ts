import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import { BULK_JOB_KIND_ENUM, BULK_JOB_KINDS, BULK_JOB_STATUS_ENUM, BULK_JOB_STATUSES } from '../../enums/bulk';
import { enumField } from '../../enums/field';
import { BULK_INPUT_KIND, BULK_RESULT_KIND, bulkErrorField, bulkOptionsField } from '../../fields/bulk-fields';
import { dateTime } from '../../fields/date-time';
import { storageFile } from '../../fields/storage-file';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/** A count in the list; the job's page shows the counts in its progress block. */
const count = (label: string, summary: string) => f.number({ system: true, in: ['list'], texts: { label, doc: { summary } } });

/**
 * Columns of `itap.bulk_jobs` the `org_admin` role reads. A job's definition (kind, input file,
 * options, owner) is fixed when it is queued; everything else is written by the platform as the job
 * runs. Profile jobs are visible to the whole organization, bulk searches to their owner only.
 */
export const bulkJobFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The job’s number in the organization (BULK-00012).' } },
  }),
  kind: enumField(BULK_JOB_KINDS, BULK_JOB_KIND_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Kind', doc: { summary: 'What the job does with each row: import profiles, update profiles, or search a face.' } },
  }),
  status: enumField(BULK_JOB_STATUSES, BULK_JOB_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: { summary: 'Where the job stands: queued, running, completed, partly failed, failed or cancelled.' },
    },
  }),
  input_file_id: storageFile({
    bucket: 'organization',
    kind: BULK_INPUT_KIND,
    displayOnly: true,
    in: [...showOnly],
    texts: { label: 'Input file', doc: { summary: 'The CSV file the job reads; only the member who started the job can open it.' } },
  }),
  options: bulkOptionsField({
    in: [...showOnly],
    texts: { label: 'Options', doc: { summary: 'How the rows are applied: a dry run, the key that finds each profile, or the search’s threshold and results.' } },
  }),
  total: count('Rows', 'The rows of the input file after its header; known once the file was read.'),
  processed: count('Processed', 'How far the job has read the file; a retry starts again from the first row, skipping rows already done.'),
  succeeded: count('Succeeded', 'Rows created, updated, found valid by a dry run, or searched (with or without a match).'),
  failed: count('Failed', 'Rows refused: nothing of them was saved, and each says why.'),
  skipped: count('Skipped', 'Blank rows of the file, with nothing to do.'),
  // Display only, so the declared kind is never written: the backend writes `bulk_result` for a profile
  // job and `bulk_search_result` for a bulk search (`bulkResultFileKind`); both are opened the same
  // way (presigned, not sensitive), and a bulk search job is visible to its owner only.
  result_file_id: storageFile({
    bucket: 'organization',
    kind: BULK_RESULT_KIND,
    displayOnly: true,
    in: [...showOnly],
    texts: {
      label: 'Result file',
      doc: { summary: 'A CSV of every row with its outcome, the profile or identity, and the error; a bulk search’s (kind bulk_search_result) is visible to its owner only, like the job.' },
    },
  }),
  error: bulkErrorField({
    in: [...showOnly],
    texts: { label: 'Error', doc: { summary: 'Why the job as a whole failed, such as a header naming an unknown column.' } },
  }),
  attempts: f.number({
    system: true,
    in: [...showOnly],
    texts: { label: 'Attempts', doc: { summary: 'How many times a worker started the job, retries included; three in a row without finishing fail it.' } },
  }),
  owner_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Started by', doc: { summary: 'The member who started the job; rows are applied as them.' } },
  }),
  started_at: dateTime({ system: true, in: [...showOnly], texts: { label: 'Started', doc: { summary: 'When a worker first picked the job up.' } } }),
  completed_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Finished', doc: { summary: 'When the job ended: completed, partly failed, failed or cancelled.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Queued', in: [...shown] }),
};
