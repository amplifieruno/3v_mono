import { describe, expect, it } from 'vitest';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { faceIdentity } from './support/authDecide.js';
import { asOrgAdmin, testEnv } from './support/clients.js';
import { dsrSteps, fileDsr, readZip, settledDsr } from './support/dsr.js';
import { erasureWorld, upload } from './support/dsrWorld.js';
import { axis } from './support/faces.js';
import { createTwoOrgs } from './support/fixtures.js';
import { insertRow, q } from './support/retention.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** DSR access / portability (slice 10 task 3): the subject bundle (SQL) and the zipped export (backend job). */

type Bundle = {
  schema?: string;
  schema_version?: number;
  request?: { code: string; request_type: string };
  entities: Record<string, unknown> & { profile: Record<string, unknown>; identities: { id: string }[] };
  files: { file_id: string; path: string; category: string }[];
  truncated: Record<string, boolean>;
  notes: string[];
};

async function subjectBundle(org: string, profile: string, limit?: number): Promise<Bundle> {
  const [r] = await runSqlRows(
    `select itap.dsr_subject_bundle('${org}', '${profile}'${limit ? `, ${limit}` : ''})::text as b`,
  );
  return JSON.parse(String(r.b)) as Bundle;
}

const ids = (rows: unknown): string[] => (rows as { id: string }[]).map((r) => r.id).sort();
const len = (rows: unknown): number => (rows as unknown[]).length;

describe('DSR subject bundle', () => {
  it('should group everything about the person by entity, with file references and no templates', async () => {
    const w = await erasureWorld();
    const s = w.subject;
    const b = await subjectBundle(w.org, s.profile);
    expect(b.entities.profile).toMatchObject({ id: s.profile, first_name: s.first, last_name: s.last, email: s.email, phone: s.phone });
    expect(ids(b.entities.identities)).toEqual([...s.identities].sort());
    expect(JSON.stringify(b.entities.identities)).not.toContain('embedding');
    for (const key of ['photos', 'documents', 'consents', 'visits', 'detections', 'sessions', 'locations', 'incidents', 'access_grants', 'watch_list_entries']) {
      expect(len(b.entities[key]), key).toBeGreaterThanOrEqual(1);
    }
    expect(len(b.entities.events)).toBeGreaterThanOrEqual(3);
    expect(len(b.entities.access_decisions)).toBeGreaterThanOrEqual(1);
    expect(len(b.entities.auth_attempts)).toBeGreaterThanOrEqual(1);
    expect(len(b.entities.segment_memberships)).toBeGreaterThanOrEqual(1);
    expect(len(b.entities.search_results)).toBe(2);
    expect(len(b.entities.audit)).toBeGreaterThanOrEqual(1);
    expect(b.entities.incidents).toEqual([expect.objectContaining({ role: 'subject' })]);
    // Files: avatar, identity photo, profile document, consent document.
    expect(b.files.map((f) => f.category).sort()).toEqual(['avatar', 'consent_document', 'document', 'photo']);
    for (const f of b.files) expect(f.path).toMatch(new RegExp(`^files/${f.category}s?/${f.file_id}`));
    expect(b.truncated).toEqual({});
    expect(b.notes).toEqual([]);
  });

  it('should bound each entity to the latest N rows with a truncation note', async () => {
    const w = await erasureWorld();
    const b = await subjectBundle(w.org, w.subject.profile, 1);
    expect(len(b.entities.events)).toBe(1);
    expect(b.truncated.events).toBe(true);
    expect(b.notes.join(' ')).toContain('events');
  });

  it('should include deliveries and inbox rows when the person is a member of the organization', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a, { email: user.email.toUpperCase() });
    const subscription = await insertRow('notification_subscriptions', {
      organization_id: q(orgA.id), user_id: q(user.id), channel: q('in_app'), event_type: q('watchlist_match'),
    });
    const delivery = await insertRow('notification_deliveries', {
      organization_id: q(orgA.id), subscription_id: q(subscription), recipient_user_id: q(user.id), channel: q('in_app'), status: q('delivered'),
      content: `'{"title": "Hello"}'::jsonb`, sent_at: 'now()', delivered_at: 'now()',
    });
    await insertRow('user_notifications', { organization_id: q(orgA.id), user_id: q(user.id), delivery_id: q(delivery), title: q('Hello') });
    const b = await subjectBundle(orgA.id, profile);
    expect(ids(b.entities.deliveries)).toEqual([delivery]);
    expect(len(b.entities.inbox)).toBe(1);
  });
});

describe('DSR access / portability export', () => {
  it('should zip bundle.json and the files into a sensitive dsr_export file and complete the request', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a, { first_name: 'Ida', last_name: 'Export' });
    const identity = await faceIdentity(orgA.id, [axis(5)], { profile });
    const photoData = Buffer.from('photo-bytes');
    const photo = await upload(orgA.id, 'identity_photo', 'face.png', 'image/png', photoData);
    await insertRow('identity_photos', { organization_id: q(orgA.id), identity_id: q(identity), file_id: q(photo) });
    const doc = await upload(orgA.id, 'profile_document', 'contract.txt', 'text/plain', Buffer.from('contract text'));
    await insertRow('profile_documents', { organization_id: q(orgA.id), profile_id: q(profile), file_id: q(doc), title: q('Contract') });

    const dsr = await fileDsr(a, profile, 'access');
    const done = await settledDsr(dsr.id);
    expect(done).toMatchObject({ status: 'completed', partial: false, last_error: null });
    expect(done.export_file_id).not.toBeNull();
    const [file] = await runSqlRows(`select bucket_id, metadata ->> 'kind' as kind, mime_type from storage.files where id = '${done.export_file_id}'`);
    expect(file).toEqual({ bucket_id: orgA.id, kind: 'dsr_export', mime_type: 'application/zip' });
    // Sensitive kind: org_admin cannot select the file row directly.
    const seen = await a.request<{ files: unknown[] }>(`query($id: uuid!) { files(where: {id: {_eq: $id}}) { id } }`, { id: done.export_file_id });
    expect(seen.files).toEqual([]);

    const zip = readZip(await createStorageClient(testEnv()).download(String(done.export_file_id)));
    const names = zip.map((e) => e.name);
    expect(names[0]).toBe('bundle.json');
    const bundle = JSON.parse(zip[0].data.toString('utf8')) as Bundle;
    expect(bundle).toMatchObject({ schema: 'itap-dsr-access/1', schema_version: 1, request: { code: dsr.code, request_type: 'access' } });
    expect(bundle.entities.profile).toMatchObject({ id: profile, first_name: 'Ida' });
    const photoEntry = zip.find((e) => e.name === bundle.files.find((f) => f.file_id === photo)?.path);
    expect(photoEntry?.data.equals(photoData)).toBe(true);
    const docEntry = zip.find((e) => e.name === bundle.files.find((f) => f.file_id === doc)?.path);
    expect(docEntry?.data.toString()).toBe('contract text');

    expect((await dsrSteps(dsr.id)).map((x) => x.step)).toEqual(['claimed', 'export_uploaded', 'completed']);
    const [audit] = await runSqlRows(`select user_id, entity, entity_id from itap.audit_log where action = 'export' and organization_id = '${orgA.id}'`);
    expect(audit).toEqual({ user_id: user.id, entity: 'profiles', entity_id: profile });
  });

  it('should produce the portability bundle with its machine-readable schema', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const avatar = await upload(orgA.id, 'avatar', 'me.png');
    await runSql(`update itap.profiles set avatar_file_id = '${avatar}' where id = '${profile}'`);
    const done = await settledDsr((await fileDsr(a, profile, 'portability')).id);
    expect(done.status).toBe('completed');
    const zip = readZip(await createStorageClient(testEnv()).download(String(done.export_file_id)));
    const bundle = JSON.parse(zip[0].data.toString('utf8')) as Bundle & { missing_files?: string[] };
    expect(bundle).toMatchObject({ schema: 'itap-dsr-portability/1', schema_version: 1, missing_files: [] });
    expect(zip.map((e) => e.name)).toEqual(['bundle.json', `files/avatars/${avatar}.png`]);
  });
});
