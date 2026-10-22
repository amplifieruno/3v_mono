import { type FlowConfig, type FlowUnknownCheck, type Layout, cond, ref, source } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { SAVED_SEARCH_RESOURCE, SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { type SavedSearchFormFields, savedSearchFormFields } from './saved-search-fields';
import { createSavedSearch, savedSearchForm, updateSavedSearch } from './saved-search-ops';
import {
  type SavedSearchColumns,
  definitionChanged,
  runNowDefinitionOf,
  savedSearchChangesOf,
  savedSearchInsertOf,
} from './saved-search-shape';
import { canonical } from './search-definition';
import { type SearchFields, searchFormBody } from './search-fields';
import { searchRangeChecks } from './search-flows';
import { searchDefaults, searchFaces } from './search-ops';
import { SENT_CLOCK_SKEW_MS, rememberSent, searchRan } from './search-sent';

/** The sentence of Review Focus 5: a changed search starts a new alert baseline. */
export const BASELINE_RESET_TEXT =
  'Saving a changed search resets its alert baseline: the next scheduled run only records what it finds, and alerts resume from the run after it.';

/** Alerts come from scheduled runs only. */
const alertWithoutSchedule = {
  id: 'savedSearchAlertWithoutSchedule',
  severity: 'warning' as const,
  anchor: 'alert_on_match',
  when: cond.all([cond.equals(ref('values', 'alert_on_match'), true), cond.not(cond.present(ref('values', 'schedule_cron')))]),
  texts: 'Alerts come from scheduled runs only: give the search a schedule, or it never alerts.',
};

/** The form: name and sharing, the search as on the Search page, then when it runs and alerts. */
function savedSearchFormBody(l: Layout<SavedSearchFormFields>) {
  return [
    l.grid(['name', 'is_shared']),
    'description',
    // The search form's nodes name only search fields, which this form has too (a layout is typed by
    // its own field map, so the shared body takes the search form's).
    ...searchFormBody(l as unknown as Layout<SearchFields>),
    l.panel([l.grid(['schedule_cron', 'alert_on_match'])], {
      key: 'schedule',
      texts: {
        title: 'Schedule and alerts',
        description:
          'Scheduled runs are kept in your search history; with alerts on, each identity a run finds that the previous run did not raises an event. Changing what it searches starts a new baseline.',
      },
    }),
  ] as const;
}

/** What "New saved search" last sent, for "Check again" after a lost answer (a check sees no form values, G12). */
let lastCreated: { readonly row: SavedSearchColumns; readonly at: number } | null = null;

/**
 * Whether a stored saved search is the one `sent` created: the same name, type, sharing, schedule,
 * filters and limit (a shared saved search of someone else's with the same name is not it).
 */
export function isSavedSearchOf(row: Readonly<Record<string, unknown>>, sent: SavedSearchColumns): boolean {
  return (
    row.name === sent.name &&
    row.search_type === sent.search_type &&
    (row.is_shared === true) === sent.is_shared &&
    (row.schedule_cron ?? null) === sent.schedule_cron &&
    row.max_results === sent.max_results &&
    JSON.stringify(canonical(row.filters ?? {})) === JSON.stringify(canonical(sent.filters ?? {}))
  );
}

/** Applied when a saved search like the one sent was created since shortly before it was sent. */
export const savedSearchCreated: FlowUnknownCheck = async ({ data }) => {
  const sent = lastCreated;
  if (sent === null) return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(SAVED_SEARCH_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'name', op: 'eq', value: sent.row.name },
          { field: 'created_at', op: 'gte', value: new Date(sent.at - SENT_CLOCK_SKEW_MS).toISOString() },
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: 20 },
    } as never);
    const found = (rows as readonly Readonly<Record<string, unknown>>[]).some((row) => isSavedSearchOf(row, sent.row));
    return found ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** What "Edit" last sent, for "Check again" after a lost answer. */
let lastEdited: { readonly id: string; readonly set: SavedSearchColumns } | null = null;

/** Applied when the saved search reads back with every column the edit sent. */
export const savedSearchSaved: FlowUnknownCheck = async ({ data }) => {
  const sent = lastEdited;
  if (sent === null) return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(SAVED_SEARCH_RESOURCE) as never, { id: sent.id } as never);
    if (row === null || row === undefined) return 'unknown';
    const stored = row as Readonly<Record<string, unknown>>;
    const same = Object.entries(sent.set).every(([key, value]) =>
      key === 'filters' ? JSON.stringify(canonical(stored.filters)) === JSON.stringify(canonical(value)) : sameValue(stored[key], value),
    );
    return same ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

const sameValue = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : (a ?? null) === (b ?? null);

/**
 * "New saved search" on the saved searches list: the search as on the Search page (photo,
 * filters, threshold), with a name, sharing, an optional schedule and alerts. The new saved
 * search's page opens; nothing runs until its schedule is due or Run now is pressed.
 */
export const newSavedSearchFlow = {
  texts: {
    label: 'New saved search',
    notify: 'Saved search saved.',
    doc: {
      summary:
        'Saves a face or attribute search to run again: by hand with Run now, or on a schedule that can alert on new matches.',
    },
  },
  icon: NAV_ICONS.newSavedSearch,
  surfaces: { list: 'regular' },
  with: { defaults: source.query(searchDefaults, {}) },
  form: {
    fields: savedSearchFormFields,
    initial: {
      search_type: { kind: 'literal', value: 'facial' },
      photo: { kind: 'literal', value: [] },
      threshold: ref('defaults', 'threshold'),
      max_results: { kind: 'literal', value: 20 },
      fuzzy: { kind: 'literal', value: false },
      is_shared: { kind: 'literal', value: false },
      alert_on_match: { kind: 'literal', value: false },
    },
    body: savedSearchFormBody,
  },
  checks: [...searchRangeChecks, alertWithoutSchedule],
  submit: {
    mutation: createSavedSearch,
    retry: 'never',
    input: ({ values }) => {
      const row = savedSearchInsertOf(values);
      lastCreated = { row, at: Date.now() };
      return row;
    },
    onUnknown: { check: savedSearchCreated },
  },
  then: { notify: true, open: { id: ref('result', 'id') } },
} satisfies FlowConfig<unknown, Record<never, never>, SavedSearchFormFields>;

/**
 * "Edit" on a saved search of yours: the same form, filled from the saved search. When the search
 * itself changes (type, photo, filters, threshold, limit, fuzzy) the form says that saving resets
 * the alert baseline (Review Focus 5); only a changed search is sent, so renaming, sharing or
 * rescheduling keeps the baseline.
 */
export const editSavedSearchFlow = {
  texts: {
    label: 'Edit',
    notify: 'Saved search updated.',
    doc: {
      summary:
        'Changes the saved search: its name, sharing, schedule and alerts, or the search itself. Changing the search resets its alert baseline.',
    },
  },
  icon: NAV_ICONS.editSavedSearch,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  with: { stored: source.query(savedSearchForm, { id: ref('record', 'id') }) },
  form: {
    fields: savedSearchFormFields,
    initial: Object.fromEntries(Object.keys(savedSearchFormFields).map((key) => [key, ref('stored', key)])),
    body: savedSearchFormBody,
  },
  checks: [
    ...searchRangeChecks,
    alertWithoutSchedule,
    {
      // A flow shows its warnings on a last step before sending: the member confirms the reset.
      id: 'savedSearchBaselineReset',
      severity: 'warning' as const,
      when: ({ values, record }: { readonly values: Readonly<Record<string, unknown>>; readonly record?: unknown }) =>
        typeof record === 'object' && record !== null && definitionChanged(record as Readonly<Record<string, unknown>>, values),
      texts: BASELINE_RESET_TEXT,
    },
  ],
  submit: {
    mutation: updateSavedSearch,
    // Idempotent: the same columns written twice are the same row.
    retry: 'after-auth-refresh',
    input: ({ values, record }) => {
      const row = (record ?? {}) as Readonly<Record<string, unknown>>;
      lastEdited = { id: String(row.id ?? ''), set: savedSearchChangesOf(row, values) };
      return lastEdited;
    },
    onUnknown: { check: savedSearchSaved },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, SavedSearchFormFields>;

/**
 * "Run now": runs the saved search once as you, at once, and opens the run in your search history
 * with its results. It is a search by hand: the schedule, the last run and the alert baseline are
 * left as they are, and it raises no alerts.
 */
export const runSavedSearchFlow = {
  texts: {
    label: 'Run now',
    notify: 'The search ran; its results are in your search history.',
    doc: {
      summary:
        'Runs the saved search once now, as you, and shows its results. It does not change the schedule, the last run or the alert baseline, and raises no alerts.',
    },
  },
  icon: NAV_ICONS.runSavedSearch,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  submit: {
    mutation: searchFaces,
    retry: 'never',
    input: ({ record }) => rememberSent(runNowDefinitionOf((record ?? {}) as Readonly<Record<string, unknown>>)),
    onUnknown: { check: searchRan },
  },
  then: { notify: true, open: { resource: SEARCH_REQUEST_RESOURCE, id: ref('result', 'search_request_id') } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
