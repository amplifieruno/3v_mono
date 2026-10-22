import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  EVENT_RESOURCE,
  IDENTITY_RESOURCE,
  INCIDENT_EVENT_HISTORY_RESOURCE,
  INCIDENT_EVENT_RESOURCE,
  INCIDENT_IDENTITY_HISTORY_RESOURCE,
  INCIDENT_IDENTITY_RESOURCE,
  INCIDENT_RESOURCE,
} from '../../data/resource-names';
import { INCIDENT_IDENTITY_ROLES, INCIDENT_IDENTITY_ROLE_ENUM } from '../../enums/incidents';
import { enumField } from '../../enums/field';

/** The incident a link row belongs to (set from the incident's tab, never changed). */
const incidentKey = f.relation({
  to: INCIDENT_RESOURCE,
  required: true,
  write: 'create',
  open: 'page',
  providerOptions: { relationship: 'incident' },
  texts: { label: 'Incident', doc: { summary: 'The incident the link belongs to.' } },
});

/** Every operation off: the read-only twin of a link table (a closed incident's links, the other side's tab). */
const READ_ONLY = {
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
} as const;

/**
 * Columns of `itap.incident_events` the `org_admin` role reads. `event_id` is a log link without a
 * foreign key (the database checks the event exists when the link is written), so it has no
 * Hasura relationship: the event is read by its id.
 */
export const incidentEventFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  incident_id: incidentKey,
  event_id: f.relation({
    to: EVENT_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Event',
      doc: { summary: 'An event that belongs to the incident; a rule links the events that opened or repeated it.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Linked', in: ['list'] }),
};

const EVENT_LINK_TEXTS = {
  label: 'Linked event',
  labelPlural: 'Linked events',
  doc: {
    summary:
      'An event that belongs to an incident: the events a rule matched for it, or events an operator linked by hand. Links are added and removed, never changed.',
  },
};

/**
 * The events of an open incident (`itap.incident_events`), added and removed on its Events tab.
 * No page of its own; the database freezes the links of a closed incident.
 */
export const incidentEvent = defineResource(INCIDENT_EVENT_RESOURCE, {
  texts: EVENT_LINK_TEXTS,
  basePath: '/incident-events',
  displayField: 'event_id',
  data: { provider: 'hasura' },
  operations: { edit: false },
  fields: incidentEventFields,
  views: {
    list: { page: false, columns: ['event_id', 'incident_id', 'created_at'] },
    show: { page: false },
    create: { body: () => ['incident_id', 'event_id'] },
  },
});

/** The same rows read only: a closed incident's events, and an event's Incidents tab. */
export const incidentEventHistory = defineResource(INCIDENT_EVENT_HISTORY_RESOURCE, {
  texts: { ...EVENT_LINK_TEXTS, label: 'Linked event (read only)' },
  basePath: '/incident-event-links',
  displayField: 'event_id',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: incidentEventFields,
  views: {
    list: { page: false, columns: ['event_id', 'incident_id', 'created_at'] },
    show: { page: false },
  },
});

/** Columns of `itap.incident_identities` the `org_admin` role reads; only the role changes. */
export const incidentIdentityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  incident_id: incidentKey,
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'identity' },
    texts: { label: 'Identity', doc: { summary: 'The person (identity) involved; at most once per incident.' } },
  }),
  role: enumField(INCIDENT_IDENTITY_ROLES, INCIDENT_IDENTITY_ROLE_ENUM, {
    required: true,
    default: 'subject',
    texts: { label: 'Role', doc: { summary: 'How the person is involved: the subject, a witness or otherwise related.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Linked', in: ['list'] }),
};

const IDENTITY_LINK_TEXTS = {
  label: 'Person involved',
  labelPlural: 'People involved',
  doc: {
    summary: 'A person (identity) involved in an incident, as its subject, a witness or otherwise related.',
  },
};

/** The people of an open incident (`itap.incident_identities`), on its People tab; the role can be changed. */
export const incidentIdentity = defineResource(INCIDENT_IDENTITY_RESOURCE, {
  texts: IDENTITY_LINK_TEXTS,
  basePath: '/incident-identities',
  displayField: 'identity_id',
  data: { provider: 'hasura' },
  fields: incidentIdentityFields,
  views: {
    list: { page: false, columns: ['identity_id', 'role', 'incident_id', 'created_at'] },
    show: { page: false },
    create: { body: (l) => ['incident_id', l.grid(['identity_id', 'role'])] },
    edit: { body: (l) => [l.grid(['incident_id', 'identity_id']), 'role'] },
  },
});

/** The same rows read only: a closed incident's people, and an identity's Incidents tab. */
export const incidentIdentityHistory = defineResource(INCIDENT_IDENTITY_HISTORY_RESOURCE, {
  texts: { ...IDENTITY_LINK_TEXTS, label: 'Person involved (read only)' },
  basePath: '/incident-identity-links',
  displayField: 'identity_id',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: incidentIdentityFields,
  views: {
    list: { page: false, columns: ['identity_id', 'role', 'incident_id', 'created_at'] },
    show: { page: false },
  },
});
