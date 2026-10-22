import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link incidentActivityDetails} (`./incident-activity-details-impl.ts`). */
export const INCIDENT_ACTIVITY_DETAILS_FIELD = 'itap.incident-activity-details';

/**
 * An incident activity's `details` jsonb shown as one line by the row's `kindField` (`kind`):
 * "Open → Acknowledged", "Step 2 by an operator: …", "REPORT-00012 (PDF)". Never written.
 */
export function incidentActivityDetails(opts: {
  readonly kindField: string;
  readonly texts?: FieldTexts;
  readonly in?: readonly ('list' | 'show')[];
}) {
  const base = f.json({
    system: true,
    ...(opts.in === undefined ? {} : { in: opts.in }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, display: INCIDENT_ACTIVITY_DETAILS_FIELD }, meta: { kindField: opts.kindField } };
}
