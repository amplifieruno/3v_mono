import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link secret} (`./secret-impl.ts`). */
export const SECRET_FIELD = 'itap.secret';

export interface SecretOptions {
  readonly texts?: string | FieldTexts;
}

/**
 * A write-only secret in a `text` column the role may write but never select
 * (`devices.password`). The mapping leaves the column out of every read
 * (`selectFieldsOf(fields, { writeOnly })`), so a form starts with no value; the input
 * is a password box that keeps an empty box out of the payload (it reports `undefined`,
 * which a payload omits), so saving a record without typing a new secret keeps the
 * stored one; on an edit form "Remove the stored value" sends `null` (the column must be
 * nullable) to clear it. It exists on the create and edit forms only: there is nothing to show. It is
 * `sensitive`, so a typed value never lands in a form draft or an audit event.
 */
export function secret(opts: SecretOptions = {}) {
  const base = f.string({
    nullable: true,
    in: ['create', 'edit'],
    // Kept out of form drafts and redacted in audit events: a typed secret is never stored.
    sensitive: true,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: SECRET_FIELD, display: SECRET_FIELD },
    meta: { writeOnly: true },
  };
}

/** Whether a declared field is a {@link secret}: write-only, never selected. */
export function isWriteOnly(field: unknown): boolean {
  if (typeof field !== 'object' || field === null) return false;
  const meta = (field as { readonly meta?: unknown }).meta;
  return typeof meta === 'object' && meta !== null && (meta as { writeOnly?: unknown }).writeOnly === true;
}
