import { describe, expect, it } from 'vitest';
import { mapRecord, parseFieldMapping, parseFixture } from '../integrations/fixture.js';
import { SYNTHETIC_PAIRS } from './authAppsPlan.js';
import { DEDICATED_SUBJECTS, DSRS, EXPORTS, HR_EXTERNAL_ID_FIELD, HR_FIELD_MAPPING, HR_FIXTURES, HR_RUNS } from './complianceFlowsPlan.js';
import { FACILITY_POLICY, LEGAL_HOLDS, PROCESSING_ACTIVITIES, RETENTION_MIN_SEED_DAYS, RETENTION_POLICIES } from './compliancePlan.js';
import { loadFaceManifest } from './faceManifest.js';
import { HISTORY_DAYS } from './historyTime.js';

const CLASSES = [
  'access_decisions', 'audit', 'auth_attempts', 'auth_evidence', 'bulk_jobs', 'deliveries', 'detections', 'embeddings_withdrawn',
  'events', 'export_jobs', 'incidents', 'integration_sync_runs', 'locations', 'photos', 'reports', 'search_history', 'sessions',
  'stats', 'terminal_syncs', 'unknown_identities', 'webhook_deliveries',
];

function mapped(version: keyof typeof HR_FIXTURES) {
  const mapping = parseFieldMapping(HR_FIELD_MAPPING);
  return parseFixture(HR_FIXTURES[version]).map((r) => mapRecord(r, mapping, HR_EXTERNAL_ID_FIELD));
}

describe('compliance seed plan', () => {
  it('should keep the demo history: every policy outlives it, one org-wide policy per class', () => {
    expect(RETENTION_MIN_SEED_DAYS).toBeGreaterThan(HISTORY_DAYS);
    expect(RETENTION_POLICIES.map((p) => p.dataClass).sort()).toEqual(CLASSES);
    for (const p of [...RETENTION_POLICIES, FACILITY_POLICY]) expect(p.retainDays, p.dataClass).toBeGreaterThanOrEqual(RETENTION_MIN_SEED_DAYS);
    for (const floor of ['audit', 'auth_attempts']) expect(RETENTION_POLICIES.find((p) => p.dataClass === floor)?.retainDays).toBeGreaterThanOrEqual(365);
    // archive exists only for reports and bulk jobs.
    for (const p of RETENTION_POLICIES.filter((x) => x.action === 'archive')) expect(['reports', 'bulk_jobs']).toContain(p.dataClass);
  });

  it('should make the facility policy stricter than the organization-wide one of its class', () => {
    const orgWide = RETENTION_POLICIES.find((p) => p.dataClass === FACILITY_POLICY.dataClass);
    expect(orgWide).toBeDefined();
    expect(FACILITY_POLICY.retainDays).toBeLessThan(orgWide?.retainDays ?? 0);
  });

  it('should link activities to policies and known classes, with DPIA text for the approved ones', () => {
    for (const a of PROCESSING_ACTIVITIES) {
      expect(CLASSES).toContain(a.policyClass);
      for (const c of a.dataClasses) expect(CLASSES).toContain(c);
      if (a.dpiaStatus === 'approved') expect(a.dpia?.length).toBeGreaterThan(0);
    }
    expect(PROCESSING_ACTIVITIES.filter((a) => a.dpia).length).toBeGreaterThanOrEqual(1);
    expect(LEGAL_HOLDS.map((h) => h.target).sort()).toEqual(['incident', 'profile']);
  });

  it('should file one request per required state, one of them overdue', () => {
    expect(new Set(DSRS.map((d) => d.type))).toEqual(new Set(['access', 'erasure', 'restriction', 'rectification']));
    const overdue = DSRS.filter((d) => d.daysAgo > 30);
    expect(overdue.map((d) => d.type)).toEqual(['rectification']);
    expect(DSRS.filter((d) => d.daysAgo <= 30 && d.type === 'rectification')).toHaveLength(1);
    // Dedicated people only for the destructive requests, never with the keys of the people / history steps.
    for (const d of DSRS.filter((x) => x.type === 'erasure' || x.type === 'restriction')) expect('dedicated' in d.subject).toBe(true);
    for (const s of Object.values(DEDICATED_SUBJECTS)) expect(s.externalId.startsWith('seed:')).toBe(false);
  });

  it('should blend dedicated faces from enrolled people only, never a sandbox pair', async () => {
    const roles = new Map((await loadFaceManifest()).map((p) => [p.folder, p.role]));
    const used = new Set(SYNTHETIC_PAIRS.map(([a, b]) => [a, b].sort().join('+')));
    const faces = Object.values(DEDICATED_SUBJECTS).map((s) => s.faces);
    for (const [a, b] of faces) {
      expect(used.has([a, b].sort().join('+'))).toBe(false);
      for (const f of [a, b]) expect(['employee', 'vip']).toContain(roles.get(f));
    }
    // The two subjects share no crop (their faces must not match each other).
    expect(new Set(faces.flat()).size).toBe(4);
  });

  it('should make the HR fixtures create, update and deactivate without touching seed people', () => {
    const v1 = mapped('v1');
    const v2 = mapped('v2');
    const ids = (rows: typeof v1) => rows.flatMap((r) => ('externalId' in r ? [r.externalId] : []));
    expect(v1.filter((r) => 'error' in r)).toHaveLength(0);
    // One v1 record has no given name (skipped by the sync as missing_name).
    expect(v1.filter((r) => 'fields' in r && !r.fields.first_name)).toHaveLength(1);
    expect(v2.every((r) => 'fields' in r && r.fields.first_name)).toBe(true);
    for (const id of [...ids(v1), ...ids(v2)]) expect(id).toMatch(/^WD-\d+$/);
    expect(ids(v1).filter((id) => !ids(v2).includes(id))).toHaveLength(1);
    expect(ids(v2).filter((id) => !ids(v1).includes(id))).toHaveLength(1);
    expect(HR_RUNS.map((r) => r.fixture)).toEqual(['v1', 'v2', 'v2']);
  });

  it('should run the incremental export more than once with a row cap', () => {
    const incremental = EXPORTS.filter((e) => e.mode === 'incremental');
    expect(incremental.length).toBeGreaterThan(0);
    for (const e of incremental) {
      expect(e.jobs).toBeGreaterThanOrEqual(2);
      expect(e.maxRows).toBeGreaterThan(0);
    }
  });
});
