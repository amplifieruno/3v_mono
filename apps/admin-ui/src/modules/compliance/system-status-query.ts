import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { RETENTION_RUN_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { readSystemStatus, systemStatus } from './system-status-format';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

export const systemStatusOperation = hasuraOperation(COMPLIANCE_BINDING, 'systemStatus', {
  kind: 'query',
  document: `query SystemStatus {
  get_system_status { generated_at status checks postgres crons queues retention }
}`,
  variables: () => ({}),
  mapResult: (data) => readSystemStatus(rootOf(data, 'get_system_status')),
});

/**
 * The Hasura action `get_system_status` (org_admin): live probes of Hasura, Postgres, InsightFace,
 * storage and the stream server (each ok, degraded or down, with its latency), Postgres figures, the
 * lag of every cron, this organization's queue depths and its last retention run. A probe that
 * fails is reported as down inside the answer; the answer itself fails only when the backend does.
 */
export const systemStatusQuery = defineQuery('itap:system-status', {
  binding: systemStatusOperation.binding,
  input: schema(z.object({})),
  output: schema(systemStatus.nullable()),
  reads: [RETENTION_RUN_RESOURCE].map(resourceByName),
});
