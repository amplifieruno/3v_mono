import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { type FieldProblem, problemIssue } from './field-issue';

/** The field implementation id of {@link secret} (`./secret-impl.ts`). */
export const SECRET_FIELD = 'itap.secret';

export interface SecretOptions {
  readonly texts?: string | FieldTexts;
  /**
   * The column is `NOT NULL` (`webhook_subscriptions.secret`): a new record needs a secret (an
   * empty box on the create form is refused) and a stored one cannot be removed, only replaced.
   */
  readonly required?: boolean;
  /** A rule for a typed secret (its length), as the column's CHECK states it. */
  readonly check?: (value: string) => FieldProblem | null;
}

/** Whether the form edits a stored record: its values carry the record's `id`. */
function storedRecord(values: Readonly<Record<string, unknown>> | undefined): boolean {
  const id = values?.id;
  return typeof id === 'string' && id !== '';
}

/**
 * A write-only secret in a `text` column the role may write but never select
 * (`devices.password`, `webhook_subscriptions.secret`). The mapping leaves the column out of every
 * read (`selectFieldsOf(fields, { writeOnly })`), so a form starts with no value; the input
 * is a password box that keeps an empty box out of the payload (it reports `undefined`,
 * which a payload omits), so saving a record without typing a new secret keeps the
 * stored one; on an edit form "Remove the stored value" sends `null` (the column must be
 * nullable) to clear it, unless the secret is `required`. It exists on the create and edit forms
 * only: there is nothing to show. It is `sensitive`, so a typed value never lands in a form draft
 * or an audit event.
 */
export function secret(opts: SecretOptions = {}) {
  const validate = (value: unknown, ctx: { readonly values?: Readonly<Record<string, unknown>> }) => {
    if (typeof value !== 'string' || value === '') {
      return opts.required === true && !storedRecord(ctx.values)
        ? problemIssue({ code: 'secret.required', text: 'Enter a secret: a new record needs one.' })
        : null;
    }
    const problem = opts.check?.(value) ?? null;
    return problem === null ? null : problemIssue(problem);
  };
  const base = f.string({
    nullable: true,
    in: ['create', 'edit'],
    // Kept out of form drafts and redacted in audit events: a typed secret is never stored.
    sensitive: true,
    ...(opts.required === true || opts.check !== undefined
      ? // buro's runner also reads an issue object (`problemIssue`); the field-types typing says string.
        { validate: validate as unknown as (value: string | null) => string | null }
      : {}),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: SECRET_FIELD, display: SECRET_FIELD },
    meta: { writeOnly: true, ...(opts.required === true ? { removable: false } : {}) },
  };
}

/** Whether a declared field is a {@link secret}: write-only, never selected. */
export function isWriteOnly(field: unknown): boolean {
  if (typeof field !== 'object' || field === null) return false;
  const meta = (field as { readonly meta?: unknown }).meta;
  return typeof meta === 'object' && meta !== null && (meta as { writeOnly?: unknown }).writeOnly === true;
}
