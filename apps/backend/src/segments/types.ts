/** Segment condition language (spec §6.5); the catalog itself is SQL (itap.segment_field_catalog, query segment_fields). */

export type SegmentTarget = 'profiles' | 'identities';

/** One row of the field catalog (tracked query `segment_fields`). */
export type CatalogField = {
  field: string;
  value_type: string;
  operators: string[];
  enum_values: string[] | null;
};

/**
 * Time-dependent inputs resolved in SQL (`segment_evaluation_context`) for one evaluation time, so the translator
 * stays a pure function: `at` (ISO), the organization-local date of `at`, that day's bounds as instants, and the work
 * schedules whose windows contain `at` (itap.in_windows).
 */
export type EvaluationContext = {
  at: string;
  localDate: string;
  dayStart: string;
  dayEnd: string;
  onShiftScheduleIds: string[];
};

/** A Hasura boolean expression (`profiles_bool_exp` / `identities_bool_exp`). */
export type Where = { [key: string]: unknown };

/** The condition tree does not fit the catalog (the SQL validator rejects such trees at save time). */
export class SegmentTranslateError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SegmentTranslateError';
    this.path = path;
  }
}
