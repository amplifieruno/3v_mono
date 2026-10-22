import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  INCIDENT_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_RESOURCE,
  SHIFT_HANDOVER_RESOURCE,
} from '../../data/resource-names';
import { ACTIVE_STATUSES } from './incident-flows';

/**
 * The columns of a handover's Incidents list: each incident with its title, status and severity now,
 * read across the `incident` relationship, so the next operator sees which are still open.
 */
export const HANDOVER_INCIDENT_COLUMNS = [
  'incident_id',
  'incident_id.title',
  'incident_id.status',
  'incident_id.severity',
] as const;

/** Columns of `itap.shift_handover_incidents` the `org_admin` role reads; a link is added or removed, never changed. */
export const shiftHandoverIncidentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  handover_id: f.relation({
    to: SHIFT_HANDOVER_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'handover' },
    texts: { label: 'Handover', doc: { summary: 'The shift handover the incident is passed on with.' } },
  }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    // Handing over is about what is still pending: the picker offers incidents being handled.
    candidates: [{ field: 'status', op: 'in', value: [...ACTIVE_STATUSES] }],
    providerOptions: { relationship: 'incident' },
    texts: {
      label: 'Incident',
      doc: { summary: 'An incident the next operator takes over; its status is shown as it is now, not as it was at handover.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

const LINK_TEXTS = {
  label: 'Handed-over incident',
  labelPlural: 'Handed-over incidents',
  doc: {
    summary:
      'An incident passed on with a shift handover: the sender adds it (or all open incidents at once) until the recipient acknowledges the handover.',
  },
};

/** The incidents of a handover its sender can still change (`itap.shift_handover_incidents`). */
export const shiftHandoverIncident = defineResource(SHIFT_HANDOVER_INCIDENT_RESOURCE, {
  texts: LINK_TEXTS,
  basePath: '/shift-handover-incidents',
  displayField: 'incident_id',
  data: { provider: 'hasura' },
  operations: { edit: false },
  builtinActions: { edit: false },
  fields: shiftHandoverIncidentFields,
  views: {
    list: { page: false, columns: [...HANDOVER_INCIDENT_COLUMNS] },
    show: { page: false },
    create: { body: () => ['handover_id', 'incident_id'] },
  },
});

/** The same rows read only: an acknowledged handover's incidents, or someone else's handover. */
export const shiftHandoverIncidentHistory = defineResource(SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE, {
  texts: { ...LINK_TEXTS, label: 'Handed-over incident (read only)' },
  basePath: '/shift-handover-incident-history',
  displayField: 'incident_id',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: shiftHandoverIncidentFields,
  views: {
    list: { page: false, columns: [...HANDOVER_INCIDENT_COLUMNS] },
    show: { page: false },
  },
});
