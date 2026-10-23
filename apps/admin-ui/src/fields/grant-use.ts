import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link grantUse} (`./grant-use-impl.ts`). */
export const GRANT_USE_FIELD = 'itap.grant-use';

/**
 * An access grant's `used_at` read with its `single_use` (plan 10 Review Focus 4): a single-use
 * grant says "Unused" until a door consumed it, then "Used" with the moment; a reusable grant
 * says "Reusable" (it is never marked used). Written only by the access engine.
 */
export function grantUse(opts: { readonly texts?: FieldTexts } = {}) {
  const base = f.dateTime({
    nullable: true,
    system: true,
    in: ['list', 'show'],
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, display: GRANT_USE_FIELD }, meta: {} };
}
