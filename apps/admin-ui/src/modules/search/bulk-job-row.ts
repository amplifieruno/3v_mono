import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import {
  BULK_JOB_RESOURCE,
  BULK_JOB_ROW_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  SEARCH_REQUEST_RESOURCE,
} from '../../data/resource-names';
import { BULK_JOB_ROW_OUTCOME_ENUM, BULK_JOB_ROW_OUTCOMES } from '../../enums/bulk';
import { enumField } from '../../enums/field';
import { bulkErrorField } from '../../fields/bulk-fields';

const shown = ['list', 'show'] as const;

/**
 * Columns of `itap.bulk_job_rows` the `org_admin` role reads: one row per input record, written by
 * the platform as the job runs (read only). A bulk search's rows are its owner's only.
 */
export const bulkJobRowFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  bulk_job_id: f.relation({
    to: BULK_JOB_RESOURCE,
    system: true,
    in: ['show'],
    open: 'page',
    providerOptions: { relationship: 'bulk_job' },
    texts: { label: 'Job', doc: { summary: 'The bulk job the row belongs to.' } },
  }),
  row_no: f.number({
    system: true,
    in: [...shown],
    texts: { label: 'Row', doc: { summary: 'The row’s line in the input file, counting from 1 after the header.' } },
  }),
  outcome: enumField(BULK_JOB_ROW_OUTCOMES, BULK_JOB_ROW_OUTCOME_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Outcome', doc: { summary: 'What became of the row: created, updated, valid (dry run), skipped, failed, matched or no match.' } },
  }),
  error: bulkErrorField({
    in: [...shown],
    texts: { label: 'Why it failed', doc: { summary: 'The reason a failed row was refused; empty for every other outcome.' } },
  }),
  label: f.string({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Label', doc: { summary: 'A bulk search row’s label from the input file (the photo’s file name when the console wrote it).' } },
  }),
  entity_code: f.string({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The code of the profile the row created or updated, or of the best matching identity.' } },
  }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'profile' },
    texts: { label: 'Profile', doc: { summary: 'The profile the row created or updated.' } },
  }),
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'identity' },
    texts: { label: 'Best match', doc: { summary: 'The identity a bulk search row found first.' } },
  }),
  confidence: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Similarity', doc: { summary: 'How alike the best match’s face is to the photo, from 0 to 1.' } },
  }),
  search_request_id: f.relation({
    to: SEARCH_REQUEST_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'search_request' },
    texts: { label: 'Search', doc: { summary: 'The search the row ran, with all its results, in your search history.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Applied', in: ['show'] }),
};

/** The columns of a profile job's rows, and of a bulk search's. */
export const PROFILE_ROW_COLUMNS = ['row_no', 'outcome', 'entity_code', 'profile_id', 'error'] as const;
export const SEARCH_ROW_COLUMNS = ['row_no', 'label', 'outcome', 'identity_id', 'confidence', 'search_request_id', 'error'] as const;

/**
 * The rows of bulk jobs (`itap.bulk_job_rows`), listed on their job's page by outcome; a row's page
 * shows its outcome, its error and, for a bulk search, the search's results. Read only.
 */
export const bulkJobRow = defineResource(BULK_JOB_ROW_RESOURCE, {
  texts: {
    label: 'Bulk job row',
    labelPlural: 'Bulk job rows',
    doc: {
      summary:
        'One row of a bulk job’s input file with what became of it: the profile created or updated, the best match of a face search, or why it failed.',
    },
  },
  basePath: '/bulk-job-rows',
  displayField: 'row_no',
  recordTitle: (record) => (typeof record.row_no === 'number' ? `Row ${record.row_no}` : null),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: bulkJobRowFields,
  views: {
    list: {
      page: false,
      columns: [...PROFILE_ROW_COLUMNS],
      defaultSort: [{ field: 'row_no', direction: 'asc' }],
    },
    show: {
      header: (l) => [l.grid(['bulk_job_id', 'row_no', 'outcome'])],
      body: (l) => [
        l.panel(['error'], {
          key: 'row-failed',
          tone: 'destructive',
          texts: { title: 'The row failed', description: 'Nothing of it was saved. Fix the file, or Retry the job once the cause is gone.' },
          when: l.equals(l.ref('record', 'outcome'), 'failed'),
        }),
        l.grid(['entity_code', 'profile_id', 'identity_id', 'confidence']),
        'search_request_id',
        'label',
        l.panel(
          [l.place(searchResultsBlock, { key: 'row-results', props: { requestId: l.ref('record', 'search_request_id'), showHistoryLink: true } })],
          { key: 'row-search', texts: { title: 'The search' }, when: l.present(l.ref('record', 'search_request_id')) },
        ),
        'created_at',
      ],
    },
  },
});
