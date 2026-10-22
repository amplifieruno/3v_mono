import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { deviceRow } from './device-health-summary-shape';

/** The most devices one read takes. */
export const DEVICE_SUMMARY_LIMIT = 1000;

const summaryInput = z.object({ facilityId: z.string().uuid().nullable() });

/** The devices in service (not retired) of one facility or of all, with their status and health (`devices`). */
export const deviceHealthSummaryOperation = hasuraOperation(ANALYTICS_BINDING, 'deviceHealthSummary', {
  kind: 'query',
  document: `query DeviceHealthSummary($where: devices_bool_exp!) {
  devices(where: $where, order_by: [{ name: asc }], limit: ${DEVICE_SUMMARY_LIMIT}) {
    id
    name
    status
    health_status
    last_seen_at
    facility {
      name
    }
  }
}`,
  variables: (input) => {
    const { facilityId } = input as z.infer<typeof summaryInput>;
    return { where: { status: { _neq: 'inactive' }, ...(facilityId === null ? {} : { facility_id: { _eq: facilityId } }) } };
  },
  mapResult: (data) => {
    const rows = z.array(deviceRow).safeParse(rootOf(data, 'devices'));
    return rows.success ? rows.data : null;
  },
});

/** The devices of the health summary (`itap:device-health-summary`). */
export const deviceHealthSummary = defineQuery('itap:device-health-summary-rows', {
  binding: deviceHealthSummaryOperation.binding,
  input: schema(summaryInput),
  output: schema(z.array(deviceRow).nullable()),
  reads: [resourceByName(DEVICE_RESOURCE)],
});
