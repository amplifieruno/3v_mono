import type { ValidationIssue } from '@burojs/core';
import type { FieldValidator } from '@burojs/field-types';

/**
 * A translatable refusal of a reusable field's validator: `code` is `<field>.<reason>`
 * (`timeWindows.sameEnds`), its text lives in the `common` bundle under
 * `validation.itap.<code>` (`src/i18n/locales/en.ts`) with `params` interpolated, and
 * `text` is the same sentence in English, the default when a bundle has no entry.
 */
export interface FieldProblem {
  readonly code: string;
  readonly text: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** The bundle key of a problem's text. */
export const problemKey = (code: string): string => `validation.itap.${code}`;

/**
 * The validator result buro's runner reads as one issue (`normalize`): the key differs from
 * `validation.<code>`, so the form looks the key up before falling back to `text`.
 */
export function problemIssue(
  problem: FieldProblem,
): Pick<ValidationIssue, 'code' | 'message' | 'path' | 'params'> {
  return {
    code: problem.code,
    message: { key: problemKey(problem.code), default: problem.text },
    path: [],
    ...(problem.params === undefined ? {} : { params: problem.params }),
  };
}

/**
 * A field `validate` that answers with {@link problemIssue}. `@burojs/field-types` types the
 * function form as `string | null`, while buro's runner also accepts an issue object
 * (`validation-runner.ts` `normalize`); the cast bridges that typing gap only.
 */
export function problemValidator<TValue = unknown>(
  check: (value: unknown) => FieldProblem | null,
): FieldValidator<TValue> {
  const validate = (value: unknown) => {
    const problem = check(value);
    return problem === null ? null : problemIssue(problem);
  };
  return validate as unknown as FieldValidator<TValue>;
}
