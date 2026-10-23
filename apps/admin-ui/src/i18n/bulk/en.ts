import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * Bulk jobs in the `common` namespace (English, primary): the sentences of the error codes a job or a
 * row ends with (`console.bulk.errors`, `src/fields/bulk-format.ts`), the job options in words, and the
 * bulk search photo picker. Kept apart from `../locales/<locale>.ts` for size; the registry deep-merges
 * it into `common`.
 */
export default {
  console: {
    bulk: {
      errors: {
        // Rows of a profile job (itap.bulk_apply_profile_row) and of any job (the backend's row reader).
        required: 'The {{column}} column is empty; this row needs it.',
        invalid_value: 'The value in the {{column}} column is not one the platform accepts.',
        invalid_date: 'The {{column}} column is not a date written as YYYY-MM-DD.',
        custom_field_invalid: 'The custom attribute {{column}} does not accept this value.',
        unknown_column: 'The {{column}} column is not one this kind of job reads.',
        constraint: 'The profile was refused by the rule {{column}}.',
        company_not_found: 'No company of the organization has this name or ID.',
        company_ambiguous: 'Several companies have this name: use the company’s ID instead.',
        work_schedule_not_found: 'No work schedule of the organization has this name.',
        work_schedule_ambiguous: 'Several work schedules have this name.',
        profile_not_found: 'No profile has this key, so nothing was updated.',
        profile_key_ambiguous: 'Several profiles have this key, so none was updated.',
        column_count_mismatch: 'The row has more or fewer cells than the header has columns.',
        unknown_error: 'The row was refused for a reason the platform did not name.',
        // Rows of a bulk search (the search request's outcome).
        no_face: 'No face was found in the photo.',
        low_quality: 'The face in the photo is too small, blurred, dark or turned away to compare.',
        invalid_image: 'The file could not be read as an image.',
        file_not_found: 'The photo could not be found: it was deleted or uploaded by someone else.',
        search_unavailable: 'The search service did not answer; Retry runs this photo again.',
        interrupted: 'The search was interrupted; Retry runs this photo again.',
        invalid_input: 'The search service refused the photo’s search settings (image ID, threshold or number of results).',
        invalid_filters: 'The search service refused the search filters.',
        // The job as a whole.
        bulk_input_missing: 'The input file is missing or was not fully uploaded.',
        file_too_large: 'The input file is larger than 5 MB.',
        too_many_rows: 'The input file has more than 10,000 rows: split it into several jobs.',
        csv_invalid: 'The input file is not a readable CSV file ({{column}}).',
        header_missing: 'The input file has no header row.',
        header_empty_column: 'The header row has an empty column name.',
        header_unknown: 'The header names the column {{column}}, which this kind of job does not read.',
        header_duplicate: 'The header names the column {{column}} twice.',
        header_missing_column: 'The header lacks the {{column}} column this kind of job needs.',
        header_no_update_columns: 'The header has the key column only: add at least one column to change.',
        all_rows_failed: 'Every row failed: each row says why.',
        max_attempts: 'Three attempts in a row stopped before the end; Retry gives the job three new attempts.',
        owner_inactive: 'The member who started the job is no longer an active member.',
        unsupported_kind: 'This kind of job is not supported.',
      },
      fallback: 'Refused: {{code}}',
      options: {
        dryRun: 'Dry run: every row is checked, nothing is saved.',
        applied: 'Rows are saved as they are read.',
        updateKey: 'Profiles found by: {{key}}',
        threshold: 'Similarity threshold: {{value}}',
        thresholdDefault: 'Similarity threshold: the organization’s default',
        maxResults: 'Results per photo: up to {{value}}',
      },
      photos: {
        add: 'Add photos',
        adding: 'Uploading {{done}} of {{count}}…',
        clear: 'Clear',
        count: '{{count}} photos ready; one search runs per photo.',
        countOne: '1 photo ready; one search runs per photo.',
        none: 'No photos yet. Add the face photos to search for; each becomes one row.',
        failed: 'A photo could not be uploaded. Check the connection and add it again.',
        wrongType: 'Only image files can be searched.',
        unreadable: 'The photos chosen earlier could not be read back: Clear, then add them all again.',
      },
    },
  },
} satisfies TranslationBundle;
