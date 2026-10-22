import { createI18nFromRegistry } from '@burojs/i18n-core';
import { resolveValidationMessage } from '@burojs/react';
import { expect } from 'vitest';
import type { FieldProblem } from '../../src/fields/field-issue';
import { problemIssue, problemKey } from '../../src/fields/field-issue';
import { buildLocaleRegistry } from '../../src/i18n/registry';

type Validate = (value: unknown, ctx: { values: Record<string, unknown> }) => unknown;

/** What a field's `validate` answers for `value`, called as buro's runner calls it. */
export async function validatorResult(validate: unknown, value: unknown): Promise<unknown> {
  return (validate as Validate)(value, { values: {} });
}

/**
 * Asserts `problem` is a translatable issue whose `en` bundle text (interpolated) is its
 * English default, and returns the text the form shows for it.
 */
export async function expectTranslated(problem: FieldProblem): Promise<string> {
  const i18n = await createI18nFromRegistry(buildLocaleRegistry(), {
    defaultLocale: 'en',
    warnOnMissing: false,
  });
  const key = problemKey(problem.code);
  expect(i18n.has(key), key).toBe(true);
  expect(i18n.t(key, problem.params === undefined ? undefined : { params: problem.params })).toBe(
    problem.text,
  );
  const issue = problemIssue(problem);
  const shown = resolveValidationMessage(issue, { t: (k, options) => i18n.t(k, options) });
  expect(shown).toBe(problem.text);
  return shown;
}

/** The English text of a validator result: a string as is, an issue's `message.default`, else `null`. */
export function issueText(result: unknown): string | null {
  if (typeof result === 'string') return result;
  if (result === null || typeof result !== 'object') return null;
  const message = (result as { readonly message?: { readonly default?: unknown } }).message;
  return typeof message?.default === 'string' ? message.default : null;
}
