import { describe, expect, it } from 'vitest';
import { asOrgAdmin, asUser, orgAdminToken } from './support/clients.js';
import { createTwoOrgs, expectError, uploadFile } from './support/fixtures.js';
import { runSql } from './support/sql.js';

/** get_system_status (slice 10 task 4): shape, live probes, org-scoped queues and retention. */

type Check = { name: string; status: string; latency_ms: number; details?: Record<string, unknown> };
type Status = {
  generated_at: string;
  status: string;
  checks: Check[];
  postgres: { connections: number; max_connections: number; db_size_bytes: number; largest_tables: { table: string; total_bytes: number }[] };
  crons: { name: string; status: string; lag_seconds: number; last_delivered_at: string | null }[];
  queues: Record<string, number>;
  retention: { status: string; scheduled_at: string } | null;
  scopes: Record<string, string>;
};

const STATUS = `query { get_system_status { generated_at status checks postgres crons queues retention scopes } }`;
const LEVELS = ['ok', 'degraded', 'down'];

describe('get_system_status', () => {
  it('should report every platform check with a status and latency', async () => {
    const { orgA, user } = await createTwoOrgs();
    const { get_system_status: s } = await asOrgAdmin(user.id, orgA.id).request<{ get_system_status: Status }>(STATUS);
    expect(LEVELS).toContain(s.status);
    expect(s.checks.map((c) => c.name)).toEqual(['hasura', 'postgres', 'insightface', 'storage', 'stream_server']);
    for (const c of s.checks) {
      expect(LEVELS).toContain(c.status);
      expect(c.latency_ms).toBeGreaterThanOrEqual(0);
    }
    // The dev stack is up.
    expect(s.checks.find((c) => c.name === 'hasura')?.status).toBe('ok');
    expect(s.checks.find((c) => c.name === 'postgres')?.status).toBe('ok');
    expect(s.checks.find((c) => c.name === 'insightface')?.details).toHaveProperty('model');
    expect(s.postgres.connections).toBeGreaterThan(0);
    expect(s.postgres.db_size_bytes).toBeGreaterThan(0);
    expect(s.postgres.largest_tables.length).toBeGreaterThan(0);
    expect(s.postgres.largest_tables.length).toBeLessThanOrEqual(10);
    const heartbeat = s.crons.find((c) => c.name === 'heartbeat');
    expect(heartbeat).toBeDefined();
    expect(LEVELS).toContain(heartbeat?.status);
    expect(s.scopes).toEqual({ checks: 'platform', postgres: 'platform', crons: 'platform', queues: 'organization', retention: 'organization' });
    expect(Object.keys(s.queues).sort()).toEqual([
      'bulk_jobs', 'data_subject_requests', 'export_jobs', 'file_deletions', 'integration_syncs', 'notification_deliveries',
      'reports', 'webhook_deliveries',
    ]);
  });

  it('should scope queue depths and the retention run to the caller organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const upload = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id);
    if (!('id' in upload)) throw new Error('upload failed');
    // A leased (not drainable) deletion and a finished retention run in organization A only.
    await runSql(
      `insert into itap.pending_file_deletions (organization_id, file_id, reason, lease_expires_at)
       values ('${orgA.id}', '${upload.id}', 'test', now() + interval '1 hour')`,
    );
    await runSql(
      `insert into itap.retention_runs (organization_id, scheduled_at, finished_at, status) values ('${orgA.id}', now(), now(), 'completed')`,
    );
    const a = (await asOrgAdmin(user.id, orgA.id).request<{ get_system_status: Status }>(STATUS)).get_system_status;
    const b = (await asOrgAdmin(other.id, orgB.id).request<{ get_system_status: Status }>(STATUS)).get_system_status;
    expect(a.queues.file_deletions).toBe(1);
    expect(b.queues.file_deletions).toBe(0);
    expect(a.retention?.status).toBe('completed');
    expect(b.retention).toBeNull();
    await runSql(`delete from itap.pending_file_deletions where file_id = '${upload.id}'`);
  });

  it('should refuse callers without an organization admin session', async () => {
    const { user } = await createTwoOrgs();
    await expectError(asUser(user.id).request(STATUS));
  });
});
