import { describe, expect, it } from 'vitest';
import { setRestriction, sqlHold } from './support/compliance.js';
import { dsrSteps, fileDsr, readDsr, settledDsr } from './support/dsr.js';
import {
  erasureWorld,
  eventLogHits,
  identifierPatterns,
  matchingRows,
  scanTables,
  storageHits,
  subjectPatterns,
  type ErasureWorld,
} from './support/dsrWorld.js';
import { expectError } from './support/fixtures.js';
import { updateByPk } from './support/operations.js';
import { count, q } from './support/retention.js';
import { waitFor } from './support/sending.js';
import { runSqlRows } from './support/sql.js';

/** Review Focus 2: erasure leaves no biometric data or direct identifier of the person anywhere; audit stays. */

const REDACTED = new Set(['{"anonymized":true}', '{"retention":true}']);
const RESTRICTION_COLUMNS = new Set(['processing_restricted', 'restricted_at', 'restricted_by', 'restriction_reason', 'updated_at']);
const DSR_AUDIT_ACTIONS = new Set(['restrict', 'unrestrict', 'export', 'erase', 'rectify', 'reject']);

/** Waits until no undelivered Hasura event mentions the person (so the erasure sees them all as finished). */
async function settleTriggers(w: ErasureWorld): Promise<void> {
  const patterns = subjectPatterns(w.subject, false);
  await waitFor(
    async () => (await eventLogHits(patterns)) - (await eventLogHits(patterns, true)),
    (pending) => pending === 0,
    30000,
  );
}

async function erase(w: ErasureWorld) {
  await settleTriggers(w);
  const request = await fileDsr(w.a, w.subject.profile, 'erasure', { notes: 'Identity verified by phone call' });
  return settledDsr(request.id);
}

describe('DSR erasure (Review Focus 2)', () => {
  it('should leave no trace of the person in any table, file or trigger log, keeping a tombstone and redacted audit', async () => {
    const w = await erasureWorld();
    const s = w.subject;
    const patterns = subjectPatterns(s);
    // The fixture really spreads the person over the schema (the scan below is meaningful).
    const before = await scanTables(patterns);
    expect(Object.keys(before).length).toBeGreaterThan(30);

    // An earlier access request: its notes name the person and its zip holds all their data.
    const access = await settledDsr((await fileDsr(w.a, s.profile, 'access', { notes: `Requested by ${s.first} ${s.last} by mail` })).id);
    expect(access.export_file_id).not.toBeNull();
    s.files.push(String(access.export_file_id));

    const done = await erase(w);
    expect(done).toMatchObject({ status: 'completed', partial: false, last_error: null });
    expect(await readDsr(access.id)).toMatchObject({ status: 'completed', export_file_id: null, notes: 'Requested by [erased] by mail' });

    // Tables: only the tombstone profile, requests about it and redacted audit rows may still mention the person.
    const after = await scanTables(patterns);
    const unexpected = Object.keys(after).filter((t) => !['profiles', 'audit_log', 'data_subject_requests'].includes(t));
    expect(unexpected, JSON.stringify(after)).toEqual([]);
    const textPatterns = subjectPatterns(s, false);
    // No name or contact anywhere; ids only as references of the tombstone / redacted audit rows.
    expect(await scanTables(identifierPatterns(s))).toEqual({});
    const [tomb] = await matchingRows('profiles', patterns);
    expect(tomb).toMatchObject({
      id: s.profile, first_name: 'Erased subject', email: null, phone: null, employee_id: null, notes: null, avatar_file_id: null,
      custom_fields: {}, status: 'inactive', processing_restricted: true,
    });
    expect(tomb.erased_at).not.toBeNull();
    expect(String(tomb.last_name)).toMatch(/^PROFILE-\d{5}$/);
    for (const row of await matchingRows('audit_log', patterns)) {
      // Redacted, a DSR action row, or the restriction itself (only the restriction columns of the tombstone).
      const keys = Object.keys((row.changes ?? {}) as Record<string, unknown>);
      const redacted =
        REDACTED.has(JSON.stringify(row.changes)) ||
        DSR_AUDIT_ACTIONS.has(String(row.action)) ||
        (row.entity === 'profiles' && keys.every((k) => RESTRICTION_COLUMNS.has(k)));
      expect(redacted, JSON.stringify(row)).toBe(true);
    }
    // Biometrics of every identity of the person are gone, the identities with them.
    const ids = s.identities.map((i) => q(i)).join(', ');
    expect(await count(`itap.identities where id in (${ids})`)).toBe(0);
    expect(await count(`itap.identity_embeddings where identity_id in (${ids})`)).toBe(0);
    expect(await count(`itap.identity_centroids where identity_id in (${ids})`)).toBe(0);

    // Files: deleted through the storage API by the job's drain; nothing in the bucket names the person.
    await waitFor(() => storageHits(w.org, subjectPatterns(s, false), s.files), (n) => n === 0, 30000);
    expect(await count(`itap.pending_file_deletions where file_id in (${s.files.map((f) => q(f)).join(', ')})`)).toBe(0);
    // Finished trigger deliveries naming the person are gone (the request's own trigger keeps only the tombstone id).
    expect(await eventLogHits(textPatterns, true)).toBe(0);

    // Steps and audit.
    const steps = (await dsrSteps(done.id)).map((x) => x.step);
    expect(steps).toEqual(expect.arrayContaining(['claimed', 'restricted', 'purged', 'profile_anonymized', 'biometrics_deleted', 'completed']));
    const [audit] = await runSqlRows(
      `select user_id, entity, (changes ->> 'partial') as partial from itap.audit_log where action = 'erase' and entity_id = '${s.profile}'`,
    );
    expect(audit).toMatchObject({ user_id: w.user.id, entity: 'profiles', partial: 'false' });
  }, 120_000);

  it('should keep the tombstone frozen and restricted, and complete a second erasure as a no-op', async () => {
    const w = await erasureWorld();
    await erase(w);
    expect((await expectError(updateByPk(w.a, 'profiles', w.subject.profile, { first_name: 'Back' }))).message).toContain('profile_erased');
    expect((await expectError(setRestriction(w.a, w.subject.profile, false, 'Lift'))).message).toContain('profile_erased');
    const again = await settledDsr((await fileDsr(w.a, w.subject.profile, 'erasure')).id);
    expect(again).toMatchObject({ status: 'completed', partial: false });
  }, 120_000);
});

describe('DSR erasure under a legal hold (partial)', () => {
  it('should retain everything held by a hold on the person and complete partially, naming categories and holds', async () => {
    const w = await erasureWorld();
    const hold = await sqlHold(w.org, { profile_id: w.subject.profile });
    const done = await erase(w);
    expect(done).toMatchObject({ status: 'completed', partial: true });
    const retained = (await dsrSteps(done.id)).find((x) => x.step === 'retained');
    expect(retained?.details.hold_ids).toEqual([hold]);
    expect(retained?.details.categories).toEqual(expect.arrayContaining(['profile', 'identities', 'detections', 'events']));
    // Held data is intact: the profile, templates, detections; processing stays restricted.
    const [p] = await runSqlRows(`select first_name, processing_restricted, erased_at from itap.profiles where id = '${w.subject.profile}'`);
    expect(p).toMatchObject({ first_name: w.subject.first, processing_restricted: 't', erased_at: 'NULL' });
    expect(await count(`itap.identity_embeddings where identity_id = '${w.subject.identities[0]}'`)).toBeGreaterThan(0);
    expect(await count(`itap.detections where identity_id = '${w.subject.identities[0]}'`)).toBe(1);
    expect((await readDsr(done.id)).last_error).toBeNull();
  }, 120_000);

  it('should retain only the held facility evidence when a facility is held and erase the rest', async () => {
    const w = await erasureWorld();
    const hold = await sqlHold(w.org, { facility_id: w.facility.id });
    const done = await erase(w);
    expect(done).toMatchObject({ status: 'completed', partial: true });
    const retained = (await dsrSteps(done.id)).find((x) => x.step === 'retained');
    expect(retained?.details.hold_ids).toEqual([hold]);
    expect(retained?.details.categories).toEqual(expect.arrayContaining(['detections']));
    // Facility evidence kept; biometrics and the profile's personal data erased.
    expect(await count(`itap.detections where facility_id = '${w.facility.id}' and identity_id = '${w.subject.identities[0]}'`)).toBe(1);
    expect(await count(`itap.identity_embeddings where identity_id = '${w.subject.identities[0]}'`)).toBe(0);
    const [p] = await runSqlRows(`select first_name, email from itap.profiles where id = '${w.subject.profile}'`);
    expect(p).toMatchObject({ first_name: 'Erased subject', email: 'NULL' });
    expect(await count(`itap.consent_records where profile_id = '${w.subject.profile}'`)).toBe(0);
  }, 120_000);
});
