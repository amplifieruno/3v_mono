import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link workspacePanelsField} (`./workspace-panels-impl.ts`). */
export const WORKSPACE_PANELS_FIELD = 'itap.workspace-panels';

/**
 * An operator workspace's `layout` jsonb, edited as its panels (`./workspace-panels-format.ts`):
 * one row per panel with a box to show it and buttons to move it up or down. Display = the shown
 * panels in order.
 */
export function workspacePanelsField(opts: { readonly texts?: string | FieldTexts } = {}) {
  const base = f.json({ default: {}, ...(opts.texts === undefined ? {} : { texts: opts.texts }) });
  return { ...base, ui: { ...base.ui, input: WORKSPACE_PANELS_FIELD, display: WORKSPACE_PANELS_FIELD }, meta: {} };
}
