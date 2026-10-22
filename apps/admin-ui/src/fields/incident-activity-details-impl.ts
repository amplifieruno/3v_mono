import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { INCIDENT_ACTIVITY_DETAILS_FIELD } from './incident-activity-details';
import { IncidentActivityDetailsDisplay } from './incident-activity-details-display';

/** The `itap.incident-activity-details` display (no input: the timeline is written by the platform). */
export const incidentActivityDetailsImplementations = {
  [INCIDENT_ACTIVITY_DETAILS_FIELD]: fieldImplementation({
    meta: z.object({ kindField: z.string() }),
    Display: IncidentActivityDetailsDisplay,
  }),
};
