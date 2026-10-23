import { f } from '@burojs/field-types';
import { BULK_JOB_RESOURCE, SAVED_SEARCH_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { SEARCH_STATUS_ENUM, SEARCH_STATUSES, SEARCH_TYPE_ENUM, SEARCH_TYPES } from '../../enums/search';
import { dateTime } from '../../fields/date-time';
import { searchFiltersField } from '../../fields/search-filters';
import { storageFile } from '../../fields/storage-file';
import { SEARCH_PHOTO_KIND } from './search-fields';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.search_requests` the `org_admin` role reads: the member's own searches only
 * (`user_id` = the session user, in metadata). A request is written by `search_faces` (or a saved
 * search's run) and never changed by the console: every field is the platform's.
 */
export const searchRequestFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Searched at', doc: { summary: 'When you ran the search.' } },
  }),
  search_type: enumField(SEARCH_TYPES, SEARCH_TYPE_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Search by', doc: { summary: 'A face photo, attribute filters, or both.' } },
  }),
  status: enumField(SEARCH_STATUSES, SEARCH_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: { summary: 'Completed (with its results, possibly none) or failed (with the reason, such as no face in the photo).' },
    },
  }),
  image_file_id: storageFile({
    bucket: 'organization',
    kind: SEARCH_PHOTO_KIND,
    accept: 'image/*',
    displayOnly: true,
    in: [...showOnly],
    texts: {
      label: 'Photo',
      doc: { summary: 'The photo searched with; only you can open it. Empty for an attribute search or once the photo was deleted.' },
    },
  }),
  filters: searchFiltersField({
    in: [...showOnly],
    texts: {
      label: 'Filters',
      doc: {
        summary:
          'The attribute filters as stored: status, profile link and type, company, gender, age, when first or last seen, and the facility and time a visit happened. Empty filters searched everyone.',
      },
    },
  }),
  threshold: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Threshold',
      doc: { summary: 'The lowest face similarity counted as a match (0.2–0.95); empty for an attribute search.' },
    },
  }),
  max_results: f.number({
    system: true,
    in: [...showOnly],
    texts: { label: 'Results at most', doc: { summary: 'The most identities the search could list.' } },
  }),
  fuzzy: f.boolean({
    system: true,
    in: [...showOnly],
    texts: { label: 'Fuzzy matches', doc: { summary: 'Whether faces up to 0.1 below the threshold were listed too, as fuzzy.' } },
  }),
  results_count: f.number({
    system: true,
    in: [...shown],
    texts: { label: 'Results', doc: { summary: 'How many identities the search found.' } },
  }),
  top_confidence: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Best similarity', doc: { summary: 'The face similarity of the best match (0–1); empty without a facial match.' } },
  }),
  face_count: f.number({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: {
      label: 'Faces in the photo',
      doc: { summary: 'How many faces the photo showed; with several, the largest was searched.' },
    },
  }),
  error: f.text({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: {
      label: 'Error',
      doc: { summary: 'Why a failed search did not run: no_face, low_quality, invalid_image, or the platform’s error.' },
    },
  }),
  duration_ms: f.number({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Duration (ms)', doc: { summary: 'How long the search took, in milliseconds.' } },
  }),
  saved_search_id: f.relation({
    to: SAVED_SEARCH_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    providerOptions: { relationship: 'saved_search' },
    texts: {
      label: 'Saved search',
      doc: { summary: 'The saved search whose scheduled run this was; empty for a search run by hand (Run now included).' },
    },
  }),
  bulk_job_id: f.relation({
    to: BULK_JOB_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'page',
    providerOptions: { relationship: 'bulk_job' },
    texts: { label: 'Bulk job', doc: { summary: 'The bulk search job whose row this search was; empty for a search run by hand.' } },
  }),
};
