import { f } from '@burojs/field-types';
import { SEARCH_REQUEST_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { SAVED_SEARCH_RUN_STATUS_ENUM, SAVED_SEARCH_RUN_STATUSES, SEARCH_TYPE_ENUM, SEARCH_TYPES } from '../../enums/search';
import { cronField } from '../../fields/cron';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { searchFiltersField } from '../../fields/search-filters';
import { storageFile } from '../../fields/storage-file';
import { SEARCH_PHOTO_KIND, searchFields } from './search-fields';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/** The settings of a saved search beside its definition: the form's and the record's fields. */
export const savedSearchSettingFields = {
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The saved search’s name; its alerts are titled with it.' } },
  }),
  description: f.text({
    nullable: true,
    texts: { label: 'Description', doc: { summary: 'Who or what it looks for, and why.' } },
  }),
  is_shared: f.boolean({
    texts: {
      label: 'Shared',
      doc: {
        summary:
          'Shared with the organization: every member sees it and can run an attribute search with it, read only; only you change, run on schedule or delete it. Its photo, runs and results stay yours.',
      },
    },
  }),
  schedule_cron: cronField({
    texts: {
      label: 'Schedule',
      doc: {
        summary:
          'When it runs by itself, as a cron in the organization’s time zone (minute hour day-of-month month weekday); the scheduler checks every hour. Empty: it runs only when you press Run now.',
      },
    },
  }),
  alert_on_match: f.boolean({
    texts: {
      label: 'Alert on new matches',
      doc: {
        summary:
          'Each scheduled run raises a "saved search match" event for every identity it finds that the previous scheduled run did not. The first run after saving, or after the search itself changed, only records the baseline.',
      },
    },
  }),
};

/** The fields of the saved search's form: the settings, then the search as the Search page edits it. */
export const savedSearchFormFields = { ...savedSearchSettingFields, ...searchFields };

export type SavedSearchFormFields = typeof savedSearchFormFields;

/**
 * Columns of `itap.saved_searches` the `org_admin` role reads: the member's own saved searches and
 * the shared ones of the organization. The definition and settings are written by the console's
 * New / Edit flows (`./saved-search-flows.ts`); the run fields by the `run_saved_searches` cron;
 * `owner_id` is stamped from the session; the last error is the owner's only (`owner_last_error`).
 */
export const savedSearchFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  ...savedSearchSettingFields,
  search_type: enumField(SEARCH_TYPES, SEARCH_TYPE_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Search by', doc: { summary: 'A face photo, attribute filters, or both.' } },
  }),
  image_file_id: storageFile({
    bucket: 'organization',
    kind: SEARCH_PHOTO_KIND,
    accept: 'image/*',
    displayOnly: true,
    in: [...showOnly],
    texts: {
      label: 'Photo',
      doc: { summary: 'The face it looks for; only its owner can open it. Empty for an attribute search.' },
    },
  }),
  filters: searchFiltersField({
    in: [...showOnly],
    texts: { label: 'Filters', doc: { summary: 'The attribute filters every identity found must match; none means everyone.' } },
  }),
  threshold: f.number({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: {
      label: 'Threshold',
      doc: { summary: 'The lowest face similarity counted as a match (0.2–0.95); empty uses the organization’s default.' },
    },
  }),
  max_results: f.number({
    system: true,
    in: [...showOnly],
    texts: { label: 'Results at most', doc: { summary: 'The most identities a run lists, best first.' } },
  }),
  fuzzy: f.boolean({
    system: true,
    in: [...showOnly],
    texts: { label: 'Fuzzy matches', doc: { summary: 'Whether faces up to 0.1 below the threshold are listed too, as fuzzy.' } },
  }),
  owner_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Owner', doc: { summary: 'Who saved it: the only member who can change, run on schedule or delete it.' } },
  }),
  next_run_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Next run', doc: { summary: 'When the scheduler runs it next; empty until planned (within the hour after saving a schedule).' } },
  }),
  last_run_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Last run', doc: { summary: 'When its last scheduled run was due. Run now does not change it.' } },
  }),
  last_run_status: enumField(SAVED_SEARCH_RUN_STATUSES, SAVED_SEARCH_RUN_STATUS_ENUM, {
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Last run status', doc: { summary: 'How the last scheduled run ended: completed, failed or skipped.' } },
  }),
  owner_last_error: f.text({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: {
      label: 'Last error',
      doc: { summary: 'Why the last scheduled run failed or was skipped; shown to the owner only.' },
    },
  }),
  last_search_request_id: f.relation({
    to: SEARCH_REQUEST_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    providerOptions: { relationship: 'last_search_request' },
    texts: {
      label: 'Last results',
      doc: {
        summary:
          'The last completed scheduled run, in your search history: the baseline the next run’s new matches are counted against. Empty before the first run and after the search itself was changed.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [...showOnly] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [...showOnly] }),
};
