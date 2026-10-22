import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { INCIDENT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { EVENT_SEVERITIES, severitiesFrom } from '../../enums/events';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { incidentListStatus } from './incidents-list-block';

const named = z.object({ name: z.string() }).nullable();

/** One incident as the list shows it. */
export const incidentItem = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  severity: z.string(),
  status: z.string(),
  created_at: z.string(),
  facility: named,
  area: named,
});

export type IncidentItem = z.infer<typeof incidentItem>;

/** What the read answers: the newest incidents and how many match in all. */
export const incidentItems = z.object({ rows: z.array(incidentItem), total: z.number() });

export const incidentListInput = z.object({
  facilityId: z.string().uuid().nullable(),
  status: incidentListStatus,
  minSeverity: z.enum(EVENT_SEVERITIES),
  limit: z.number().int().min(1),
});

export type IncidentListInput = z.infer<typeof incidentListInput>;

/**
 * The filter of the list: not resolved or closed (`open`) or the statuses named, the severity and above, and the facility
 * with the incidents of no facility (shared by every facility, like the incident list's scope).
 */
export function incidentWhere({ facilityId, status, minSeverity }: IncidentListInput): Record<string, unknown> {
  return {
    severity: { _in: severitiesFrom(minSeverity) },
    ...(status === 'open' ? { status: { _nin: ['resolved', 'closed'] } } : {}),
    ...(Array.isArray(status) ? { status: { _in: status } } : {}),
    ...(facilityId === null ? {} : { _or: [{ facility_id: { _eq: facilityId } }, { facility_id: { _is_null: true } }] }),
  };
}

/** The newest incidents matching the block's filter, and their count (`incidents`). */
export const incidentsListOperation = hasuraOperation(ANALYTICS_BINDING, 'incidentsList', {
  kind: 'query',
  document: `query IncidentsList($where: incidents_bool_exp!, $limit: Int!) {
  incidents(where: $where, order_by: [{ created_at: desc }], limit: $limit) {
    id
    code
    title
    severity
    status
    created_at
    facility {
      name
    }
    area {
      name
    }
  }
  incidents_aggregate(where: $where) {
    aggregate {
      count
    }
  }
}`,
  variables: (input) => ({ where: incidentWhere(input as IncidentListInput), limit: (input as IncidentListInput).limit }),
  mapResult: (data) => {
    const rows = z.array(incidentItem).safeParse(rootOf(data, 'incidents'));
    const total = z.object({ aggregate: z.object({ count: z.number() }) }).safeParse(rootOf(data, 'incidents_aggregate'));
    return rows.success && total.success ? { rows: rows.data, total: total.data.aggregate.count } : null;
  },
});

/** The incidents of the list block (`itap:incidents-list`). */
export const incidentsList = defineQuery('itap:incidents-list-rows', {
  binding: incidentsListOperation.binding,
  input: schema(incidentListInput),
  output: schema(incidentItems.nullable()),
  reads: [resourceByName(INCIDENT_RESOURCE)],
});
