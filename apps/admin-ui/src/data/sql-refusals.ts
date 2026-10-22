import type { ActionRefusalReader, RefusalIssue } from './action-refusals';

/**
 * How Hasura words a refusal raised inside a tracked SQL function or a single-statement write:
 * `Check constraint violation. <detail>` (the ITAP functions raise `check_violation` with their
 * code as the message, `itap.raise_code`), `Uniqueness violation. <detail>` or `Foreign key
 * violation. <detail>`. The envelope's `extensions.code` is `permission-error` or
 * `constraint-violation`, which the Hasura provider reads as "may have been applied" on a custom
 * mutation (`tasks/ui/buro-gaps.md` G33).
 */
const SQL_REFUSAL = /^(Check constraint violation|Uniqueness violation|Foreign key violation)\.\s*(.*)$/su;

/** The refused statement's detail (the ITAP code, or the database's own words), or `null`. */
export function sqlRefusalDetail(message: string): string | null {
  const match = SQL_REFUSAL.exec(message.trim());
  return match === null ? null : (match[2] ?? '').trim();
}

/**
 * The sentence for one refusal code, or a function of the code's argument (`merge_rows_moved:3`
 * reads `3`). A detail that is no known code may still name a constraint: an entry whose key
 * appears in the detail (`identity_relationships_pair_key`) answers it.
 */
export type SqlRefusalText = string | ((argument: string) => string);

/** Splits `merge_rows_moved:3` into the code and its argument. */
function codeOf(detail: string): { readonly code: string; readonly argument: string } {
  const at = detail.indexOf(':');
  return at < 0 ? { code: detail, argument: '' } : { code: detail.slice(0, at), argument: detail.slice(at + 1) };
}

/**
 * The refusal reader of a tracked SQL function or a one-row write (`./action-refusals.ts`). The
 * function runs in one transaction, so a refusal is definite: nothing was applied. A known code
 * reads as its sentence; any other refusal of the database reads as `fallback` with the detail,
 * so the form says what was refused instead of "may have been applied". Errors that are no
 * refusal (transport, a lost answer) pass through unchanged. Issues are form-level (no field).
 */
export function sqlRefusals(
  texts: Readonly<Record<string, SqlRefusalText>>,
  fallback = 'The database refused the change: {{detail}}. Nothing was changed.',
): ActionRefusalReader {
  return ({ message }) => {
    const detail = sqlRefusalDetail(message);
    if (detail === null) return null;
    const { code, argument } = codeOf(detail);
    const key = Object.hasOwn(texts, code) ? code : Object.keys(texts).find((name) => detail.includes(name));
    const named = key === undefined ? undefined : texts[key];
    const issue: RefusalIssue =
      key === undefined || named === undefined
        ? { code: 'database_refused', message: fallback.replace('{{detail}}', detail), path: [] }
        : { code: key, message: typeof named === 'string' ? named : named(argument), path: [] };
    return [issue];
  };
}
