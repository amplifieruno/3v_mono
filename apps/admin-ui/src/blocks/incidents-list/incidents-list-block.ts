import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { EVENT_SEVERITIES } from '../../enums/events';

/** Which incidents the list shows: those not resolved or closed, or every one. */
export const INCIDENT_LIST_STATES = ['open', 'all'] as const;

/** The most incidents the list shows. */
export const INCIDENT_LIST_MAX = 50;

/**
 * The newest incidents (`itap:incidents-list`, `incidents`): each with its severity, code and title
 * (a link to the incident), place, status and when it was raised, and how many match in all.
 * Props `facilityId` (`null` = every facility; incidents of no facility are listed for every
 * facility, as the incident list does), `status` (`open` = not resolved or closed), `minSeverity`
 * (that severity and above) and `limit`.
 */
export const incidentsListBlock = defineBlock('itap:incidents-list', {
  texts: {
    label: 'Incidents',
    loading: 'Reading the incidents…',
    failed: 'The incidents could not be read.',
    noneOpen: 'No open incident.',
    none: 'No incident.',
    shown: 'The newest {{shown}} of {{total}}.',
    everywhere: 'Whole organization',
    raised: 'Raised {{time}}',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    status: prop(z.enum(INCIDENT_LIST_STATES)).default('open'),
    minSeverity: prop(z.enum(EVENT_SEVERITIES)).default('info'),
    limit: prop(z.number().int().min(1).max(INCIDENT_LIST_MAX)).default(8),
  },
});
