import {
  type SearchDefinition,
  type SearchValues,
  sameDefinition,
  searchDefinitionOf,
  searchValuesOf,
  storedDefinitionOf,
} from './search-definition';

/**
 * A saved search between its form and its row (`itap.saved_searches`): the form edits the search
 * definition as the Search page does (`./search-fields.ts`) plus the name, sharing, schedule and
 * alerts; the row stores the definition in the action's columns.
 */

/** The settings a saved search has beside its definition. */
export type SavedSearchSettings = {
  readonly name: string;
  readonly description: string | null;
  readonly is_shared: boolean;
  readonly schedule_cron: string | null;
  readonly alert_on_match: boolean;
};

/** The saved search's form values: the search form's, then the settings. */
export type SavedSearchValues = SearchValues & SavedSearchSettings;

/** The columns a saved search is written with (`saved_searches_insert_input` / `_set_input`). */
export type SavedSearchColumns = SavedSearchSettings & Partial<SearchDefinition>;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** The settings from the form's values (blank texts are no text). */
export function savedSearchSettingsOf(values: Readonly<Record<string, unknown>>): SavedSearchSettings {
  return {
    name: text(values.name) ?? '',
    description: text(values.description),
    is_shared: values.is_shared === true,
    schedule_cron: text(values.schedule_cron),
    alert_on_match: values.alert_on_match === true,
  };
}

/** A new saved search's row from the form's values: its settings and the whole definition. */
export function savedSearchInsertOf(values: Readonly<Record<string, unknown>>): SavedSearchColumns {
  return { ...savedSearchSettingsOf(values), ...searchDefinitionOf(values) };
}

/** The form's values for a stored saved search (the edit form starts from them). */
export function savedSearchValuesOf(row: Readonly<Record<string, unknown>>): SavedSearchValues {
  return {
    ...searchValuesOf(row),
    name: typeof row.name === 'string' ? row.name : '',
    description: typeof row.description === 'string' ? row.description : null,
    is_shared: row.is_shared === true,
    schedule_cron: typeof row.schedule_cron === 'string' ? row.schedule_cron : null,
    alert_on_match: row.alert_on_match === true,
  };
}

/**
 * Whether the form changes what the saved search searches (its type, photo, filters, threshold,
 * limit or fuzzy matches) against what the form started from. Saving such a change resets the
 * alert baseline on the server (`saved_searches_guard`).
 */
export function definitionChanged(row: Readonly<Record<string, unknown>>, values: Readonly<Record<string, unknown>>): boolean {
  return !sameDefinition(searchDefinitionOf(searchValuesOf(row)), searchDefinitionOf(values));
}

/**
 * The columns an edit writes: the settings always, the definition only when the form changed it.
 * An unchanged definition is not sent, so the stored one stays exactly as it was (a filter of
 * several statuses the form shows as one, G64) and the alert baseline is kept.
 */
export function savedSearchChangesOf(row: Readonly<Record<string, unknown>>, values: Readonly<Record<string, unknown>>): SavedSearchColumns {
  const settings = savedSearchSettingsOf(values);
  return definitionChanged(row, values) ? { ...settings, ...searchDefinitionOf(values) } : settings;
}

/** What "Run now" sends: the saved definition as stored. */
export const runNowDefinitionOf = (row: Readonly<Record<string, unknown>>): SearchDefinition => storedDefinitionOf(row);
