import { describe, expect, it } from 'vitest';
import { sqlHold } from './support/compliance.js';
import { runSql, runSqlRows } from './support/sql.js';
import {
  ago,
  count,
  fileRow,
  insertRow,
  purge,
  purgeAll,
  q,
  queued,
  retentionWorld,
  sqlIdentity,
  sqlProfile,
} from './support/retention.js';

/** Retention classes photos, embeddings_withdrawn (consent window), unknown_identities, auth_attempts, auth_evidence. */

const VECTOR = `('[' || array_to_string(array_fill(0, ARRAY[511]) || 1, ',') || ']')::vector`;

const embedding = (org: string, identity: string) =>
  insertRow('identity_embeddings', { organization_id: q(org), identity_id: q(identity), embedding: VECTOR, quality_score: '0.9' });

const photo = async (org: string, identity: string, days: number): Promise<{ id: string; file: string }> => {
  const file = await fileRow(org, 'identity_photo');
  const id = await insertRow('identity_photos', {
    organization_id: q(org), identity_id: q(identity), file_id: q(file), created_at: ago(days),
  });
  return { id, file };
};

const withdrawConsent = (org: string, profile: string, days: number) =>
  insertRow('consent_records', {
    organization_id: q(org), profile_id: q(profile), purpose: q('biometric_processing'), status: q('withdrawn'),
    granted_at: ago(days + 100), withdrawn_at: ago(days),
  });

describe('retention: photos and consent-withdrawn biometrics', () => {
  it('should delete photos of archived unknown identities only and queue their files', async () => {
    const w = await retentionWorld();
    const archived = await sqlIdentity(w.org, { status: q('archived') });
    const active = await sqlIdentity(w.org);
    const gone = await photo(w.org, archived, 40);
    await runSql(`update itap.identities set primary_photo_file_id = '${gone.file}' where id = '${archived}'`);
    const kept = await photo(w.org, active, 40);
    expect(await purgeAll('photos', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 0, files_enqueued: 1 });
    expect(await count(`itap.identity_photos where id = '${gone.id}'`)).toBe(0);
    expect(await count(`itap.identity_photos where id = '${kept.id}'`)).toBe(1);
    const [i] = await runSqlRows(`select primary_photo_file_id from itap.identities where id = '${archived}'`);
    expect(i.primary_photo_file_id).toBe('NULL');
    expect(await queued(gone.file)).toBe(true);
    expect(await queued(kept.file)).toBe(false);
  });

  it('should delete biometrics only once the consent window passed, never of held people', async () => {
    const w = await retentionWorld();
    const make = async (withdrawnDaysAgo: number) => {
      const profile = await sqlProfile(w.org);
      const identity = await sqlIdentity(w.org, { profile_id: q(profile) });
      await embedding(w.org, identity);
      const p = await photo(w.org, identity, 100);
      await withdrawConsent(w.org, profile, withdrawnDaysAgo);
      return { profile, identity, file: p.file };
    };
    const old = await make(40);
    const fresh = await make(10);
    const held = await make(40);
    await sqlHold(w.org, { profile_id: held.profile });
    const [m] = await runSqlRows(`select matching_enabled from itap.identities where id = '${old.identity}'`);
    expect(m.matching_enabled).toBe('f');

    expect(await purgeAll('embeddings_withdrawn', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 1, files_enqueued: 1 });
    const bio = (id: string) =>
      Promise.all([
        count(`itap.identity_embeddings where identity_id = '${id}'`),
        count(`itap.identity_centroids where identity_id = '${id}'`),
        count(`itap.identity_photos where identity_id = '${id}'`),
      ]);
    expect(await bio(old.identity)).toEqual([0, 0, 0]);
    expect(await queued(old.file)).toBe(true);
    expect((await bio(fresh.identity))[0]).toBe(1);
    expect((await bio(held.identity))[0]).toBe(1);
    expect(await count(`itap.identities where id = '${old.identity}'`)).toBe(1);
  });
});

describe('retention: unknown identities', () => {
  it('should delete stale unlinked identities with their biometrics and ended-hold targets, keeping protected ones', async () => {
    const w = await retentionWorld();
    const stale = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    await embedding(w.org, stale);
    const p = await photo(w.org, stale, 40);
    await sqlHold(w.org, { identity_id: stale }, { starts: ago(100), ends: ago(50) });
    const linked = await sqlIdentity(w.org, { profile_id: q(await sqlProfile(w.org)), last_seen_at: ago(40) });
    const seen = await sqlIdentity(w.org, { last_seen_at: ago(5) });
    const inIncident = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    const incident = await insertRow('incidents', { organization_id: q(w.org), title: q('X') });
    await insertRow('incident_identities', { organization_id: q(w.org), incident_id: q(incident), identity_id: q(inIncident) });
    const held = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    await sqlHold(w.org, { identity_id: held });
    const future = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    await sqlHold(w.org, { identity_id: future }, { starts: `now() + interval '1 day'` });
    const source = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    const target = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    const merge = await insertRow('identity_merges', { organization_id: q(w.org), target_identity_id: q(target) });
    await insertRow('identity_merge_sources', {
      organization_id: q(w.org), merge_id: q(merge), source_identity_id: q(source), previous_status: q('unverified'),
    });

    const r = await purgeAll('unknown_identities', w.org, ago(30));
    expect(r).toEqual({ affected: 1, skipped_by_hold: 1, files_enqueued: 1 });
    expect(await count(`itap.identities where id = '${stale}'`)).toBe(0);
    expect(await queued(p.file)).toBe(true);
    const kept = [linked, seen, inIncident, held, future, source, target].map((id) => `'${id}'`).join(',');
    expect(await count(`itap.identities where id in (${kept})`)).toBe(7);
  });

  it('should anonymize unknown identities (biometrics gone, attributes emptied, matching off)', async () => {
    const w = await retentionWorld();
    const id = await sqlIdentity(w.org, { last_seen_at: ago(40), attributes: `'{"age": 30}'::jsonb` });
    await embedding(w.org, id);
    expect(await purge('unknown_identities', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 1 });
    const [i] = await runSqlRows(`select attributes::text as a, matching_enabled from itap.identities where id = '${id}'`);
    expect(i).toEqual({ a: '{"anonymized": true}', matching_enabled: 'f' });
    expect(await count(`itap.identity_embeddings where identity_id = '${id}'`)).toBe(0);
    expect(await purge('unknown_identities', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 0 });
  });
});

describe('retention: face authentication records', () => {
  const attempt = (org: string, app: string, days: number, extra: Record<string, string> = {}) =>
    insertRow('authentication_attempts', {
      organization_id: q(org), application_id: q(app), attempt_no: '1', step: q('initial'), mode: q('identification'),
      outcome: q('failure'), failure_reason: q('below_threshold'), attempted_at: ago(days), ip: q('10.1.2.3'),
      user_agent: q('kiosk/1.0'), device_ref: q('dev-1'), comparison_score: '0.4', ...extra,
    });

  it('should enforce the 365-day floor, delete old attempts with their digests and keep held ones', async () => {
    const w = await retentionWorld();
    const app = await insertRow('client_applications', { organization_id: q(w.org), name: q(`App ${Date.now()}`), platform: q('kiosk') });
    const held = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    const gone = await attempt(w.org, app, 400);
    await insertRow('auth_sequence_digests', { organization_id: q(w.org), digest: q(`d-${gone}`), attempt_id: q(gone) });
    const kept = await attempt(w.org, app, 400, { claimed_identity_id: q(held) });
    await expect(purge('auth_attempts', w.org, ago(30))).rejects.toThrow(/retention_floor/);
    expect(await purgeAll('auth_attempts', w.org, ago(365))).toMatchObject({ affected: 2, skipped_by_hold: 1 });
    expect(await count(`itap.authentication_attempts where id = '${gone}'`)).toBe(0);
    expect(await count(`itap.auth_sequence_digests where digest = 'd-${gone}'`)).toBe(0);
    expect(await count(`itap.authentication_attempts where id = '${kept}'`)).toBe(1);
  });

  it('should anonymize attempts and queue evidence frames (auth_evidence keeps the attempt)', async () => {
    const w = await retentionWorld();
    const app = await insertRow('client_applications', { organization_id: q(w.org), name: q(`App ${Date.now()}`), platform: q('kiosk') });
    const evidence = await fileRow(w.org, 'auth_capture');
    const withEvidence = await attempt(w.org, app, 400, { evidence_file_id: q(evidence) });
    expect(await purgeAll('auth_evidence', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 0, files_enqueued: 1 });
    expect(await queued(evidence)).toBe(true);
    const [e] = await runSqlRows(`select evidence_file_id, ip from itap.authentication_attempts where id = '${withEvidence}'`);
    expect(e).toEqual({ evidence_file_id: 'NULL', ip: '10.1.2.3' });

    expect(await purgeAll('auth_attempts', w.org, ago(365), { action: 'anonymize' })).toMatchObject({ affected: 1 });
    const [a] = await runSqlRows(
      `select ip, user_agent, device_ref, comparison_score, outcome from itap.authentication_attempts where id = '${withEvidence}'`,
    );
    expect(a).toEqual({ ip: 'NULL', user_agent: 'NULL', device_ref: 'NULL', comparison_score: 'NULL', outcome: 'failure' });
  });

  it('should delete revoked sandbox applications and synthetic identities once no sandbox app is in use', async () => {
    const w = await retentionWorld();
    const sandbox = await insertRow('client_applications', {
      organization_id: q(w.org), name: q(`Sandbox ${Date.now()}`), platform: q('kiosk'), is_sandbox: 'true',
      status: q('revoked'), created_at: ago(500), updated_at: ago(400),
    });
    const synthetic = await sqlIdentity(w.org, { is_synthetic: 'true', created_at: ago(400) });
    await embedding(w.org, synthetic);
    const live = await insertRow('client_applications', {
      organization_id: q(w.org), name: q(`Live sandbox ${Date.now()}`), platform: q('kiosk'), is_sandbox: 'true',
    });
    expect(await purgeAll('auth_attempts', w.org, ago(365))).toMatchObject({ affected: 1 });
    expect(await count(`itap.client_applications where id = '${sandbox}'`)).toBe(0);
    expect(await count(`itap.identities where id = '${synthetic}'`)).toBe(1);
    await runSql(`update itap.client_applications set status = 'revoked' where id = '${live}'`);
    expect(await purgeAll('auth_attempts', w.org, ago(365))).toMatchObject({ affected: 1 });
    expect(await count(`itap.identities where id = '${synthetic}'`)).toBe(0);
  });
});
