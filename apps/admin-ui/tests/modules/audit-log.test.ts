import { describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { AUDIT_ENTITIES, AUDIT_ENTITY_TABLES, auditEntityLabel, auditEntityResource } from '../../src/data/audit-entities';
import { AUDIT_ENTRY_RESOURCE } from '../../src/data/resource-names';
import { auditDiff, auditRecordName, auditValue, fieldWords, isSecretKey } from '../../src/modules/compliance/audit-diff-format';
import { formatBytes, formatLag, humanize, readSystemStatus } from '../../src/modules/compliance/system-status-format';
import { ITAP_TABLES } from '../../src/modules';

/**
 * The audit log's reading of `changes` (before / after per field, JSON objects opened into their
 * changed keys, secrets always "redacted"), the table → page map behind its record links, and the
 * system status answer read defensively (unknown names and levels, a probe that is down).
 */

describe('an audit entry’s changes', () => {
  it('should read an update field by field, opening a changed JSON object into its keys', () => {
    const diff = auditDiff('update', {
      name: { old: 'Lobby', new: 'Main lobby' },
      config: {
        old: { endpoint: 'https://a.test', schedule_cron: '0 2 * * *', nested: { depth: 1, keep: true } },
        new: { endpoint: 'https://a.test', schedule_cron: '0 3 * * *', nested: { depth: 2, keep: true } },
      },
      tags: { old: ['a'], new: ['a', 'b'] },
    });
    expect(diff).toEqual({
      kind: 'changes',
      rows: [
        { field: 'config.nested.depth', before: { kind: 'text', text: '1' }, after: { kind: 'text', text: '2' } },
        { field: 'config.schedule_cron', before: { kind: 'text', text: '0 2 * * *' }, after: { kind: 'text', text: '0 3 * * *' } },
        { field: 'name', before: { kind: 'text', text: 'Lobby' }, after: { kind: 'text', text: 'Main lobby' } },
        { field: 'tags', before: { kind: 'json', text: '[\n  "a"\n]' }, after: { kind: 'json', text: '[\n  "a",\n  "b"\n]' } },
      ],
    });
    expect(fieldWords('config.schedule_cron')).toBe('Config › schedule cron');
  });

  it('should show redacted values and secret-named keys as redacted, at any depth', () => {
    const diff = auditDiff('update', {
      password: { old: '[redacted]', new: '[redacted]' },
      settings: { old: { api_key: 'old-value-not-real', url: 'a' }, new: { api_key: 'new-value-not-real', url: 'b' } },
      has_secret: { old: false, new: true },
    });
    expect(diff.kind).toBe('changes');
    const rows = diff.kind === 'changes' ? diff.rows : [];
    expect(rows.find((row) => row.field === 'password')).toEqual({ field: 'password', before: { kind: 'redacted' }, after: { kind: 'redacted' } });
    expect(rows.find((row) => row.field === 'settings.api_key')).toEqual({ field: 'settings.api_key', before: { kind: 'redacted' }, after: { kind: 'redacted' } });
    expect(rows.find((row) => row.field === 'has_secret')?.after).toEqual({ kind: 'text', text: 'true' });
    expect(JSON.stringify(rows)).not.toContain('value-not-real');
    // Inside a JSON value shown whole, secret keys are replaced too.
    const shown = auditValue({ url: 'x', token_hash: 'abc-not-real', inner: [{ secret: 's-not-real' }] });
    expect(shown.kind).toBe('json');
    expect(JSON.stringify(shown)).not.toContain('not-real');
    expect(isSecretKey('secret_hash')).toBe(true);
    expect(isSecretKey('has_secret')).toBe(false);
    expect(isSecretKey('first_name')).toBe(false);
  });

  it('should read created, removed, purged and other entries', () => {
    expect(auditDiff('insert', { name: 'Gate', password: '[redacted]', area_id: null })).toEqual({
      kind: 'created',
      rows: [
        { field: 'area_id', after: { kind: 'empty' } },
        { field: 'name', after: { kind: 'text', text: 'Gate' } },
        { field: 'password', after: { kind: 'redacted' } },
      ],
    });
    expect(auditDiff('delete', { code: 'X' }).kind).toBe('removed');
    expect(auditDiff('delete', { retention: true })).toEqual({ kind: 'retention' });
    expect(auditDiff('erase', { code: 'DSR-00003', partial: false })).toEqual({
      kind: 'details',
      rows: [
        { field: 'code', after: { kind: 'text', text: 'DSR-00003' } },
        { field: 'partial', after: { kind: 'text', text: 'false' } },
      ],
    });
    expect(auditDiff('switch_org', null)).toEqual({ kind: 'none' });
    // Blanked later by an erasure or the audit retention, whatever the original action was.
    for (const action of ['insert', 'update', 'delete', 'merge']) expect(auditDiff(action, { anonymized: true })).toEqual({ kind: 'anonymized' });
    expect(auditDiff('update', { anonymized: { old: false, new: true } }).kind).toBe('changes');
    expect(auditRecordName({ name: { old: 'A', new: 'B' } })).toBe('B');
    expect(auditRecordName({ code: 'DEVICE-00001', password: '[redacted]' })).toBe('DEVICE-00001');
    expect(auditRecordName({ status: { old: 'a', new: 'b' } })).toBeNull();
  });
});

describe('the audited tables', () => {
  it('should map each table with a page to a registered resource over that table', async () => {
    await app.ready;
    const linked = Object.entries(AUDIT_ENTITIES).filter(([, [, resource]]) => resource !== null);
    expect(linked.length).toBeGreaterThan(40);
    for (const [table, [, resource]] of linked) {
      expect(app.registry.get(String(resource)), table).toBeDefined();
      expect(ITAP_TABLES[String(resource)]?.table, table).toBe(table);
    }
  });

  it('should show a known table by its label and an unknown one by its raw name, unlinked', () => {
    expect(auditEntityLabel('profiles')).toBe('Profile');
    expect(auditEntityResource('profiles')).toBe('profile');
    expect(auditEntityLabel('brand_new_table')).toBe('brand_new_table');
    expect(auditEntityResource('brand_new_table')).toBeNull();
    expect(auditEntityResource('legal_hold_targets')).toBeNull();
    expect(auditEntityResource('constructor')).toBeNull();
    expect(AUDIT_ENTITY_TABLES).toEqual([...AUDIT_ENTITY_TABLES].sort());
  });

  it('should page the log by cursor, never offer a write, and select no write-only column', async () => {
    await app.ready;
    const def = app.registry.get(AUDIT_ENTRY_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations).toMatchObject({ create: false, edit: false, delete: false });
    expect(ITAP_TABLES[AUDIT_ENTRY_RESOURCE]).toMatchObject({ table: 'audit_log', orderByField: 'occurred_at', noAggregate: true });
  });
});

describe('the system status answer', () => {
  it('should keep a down probe, drop malformed entries and read unknown levels and names safely', () => {
    const status = readSystemStatus({
      generated_at: '2026-10-23T10:00:00Z',
      status: 'down',
      checks: [
        { name: 'insightface', status: 'down', latency_ms: 3001, details: { error: 'The operation was aborted due to timeout' } },
        { name: 'hasura', status: 'ok', latency_ms: 4 },
        { status: 'ok' },
        'garbage',
      ],
      postgres: { connections: 12, max_connections: 100, db_size_bytes: 52_428_800, largest_tables: [{ table: 'itap.detections', total_bytes: 1024 }, { table: 'x' }] },
      crons: [{ name: 'new_cron', status: 'sideways', lag_seconds: 3725 }],
      queues: { file_deletions: 3, brand_new_queue: 1, broken: 'x' },
      retention: null,
    });
    expect(status?.checks.map((check) => [check.name, check.status])).toEqual([
      ['insightface', 'down'],
      ['hasura', 'ok'],
    ]);
    expect(status?.checks[0]?.details.error).toMatch(/timeout/);
    expect(status?.postgres.largest_tables).toHaveLength(1);
    expect(status?.crons[0]).toMatchObject({ name: 'new_cron', status: 'unknown', lag_seconds: 3725, errors_24h: 0, last_delivered_at: null });
    expect(status?.queues).toEqual([
      { key: 'file_deletions', count: 3 },
      { key: 'brand_new_queue', count: 1 },
    ]);
    expect(readSystemStatus(null)).toBeNull();
    expect(readSystemStatus({})).toMatchObject({ status: 'unknown', checks: [], crons: [], queues: [], retention: null });
  });

  it('should put sizes, lags and unknown names into words', () => {
    expect(formatBytes(52_428_800)).toBe('50.0 MB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(null)).toBe('—');
    expect(formatLag(0)).toBe('none');
    expect(formatLag(3725)).toBe('1 h 2 min');
    expect(formatLag(90_061)).toBe('1 d 1 h');
    expect(humanize('brand_new_queue')).toBe('Brand new queue');
  });
});
