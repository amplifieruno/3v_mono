import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { uploadFixture } from './support/integrations.js';
import { runSql } from './support/sql.js';
import { ago, count, fileRow, inRetentionContext, purge, queued, retentionWorld, sqlIdentity, sqlProfile } from './support/retention.js';

/**
 * Slice 10 final wave: queued files stay detached (C1), no-op retention updates (C3), orphan sweep (C4), audited
 * opening of HR fixtures (M2).
 */

describe('Queued file guard', () => {
  it('should refuse attaching a file that is queued for deletion', async () => {
    const w = await retentionWorld();
    const file = await fileRow(w.org, 'identity_photo');
    await runSql(`select itap.enqueue_file_deletion('${w.org}', '${file}', 'test')`);
    const identity = await sqlIdentity(w.org);
    await expect(runSql(`update itap.identities set primary_photo_file_id = '${file}' where id = '${identity}'`)).rejects.toThrow(
      /file_pending_deletion:primary_photo_file_id/,
    );
    // A file that is not queued attaches as before.
    const fine = await fileRow(w.org, 'identity_photo');
    await runSql(`update itap.identities set primary_photo_file_id = '${fine}' where id = '${identity}'`);
  });
});

describe('Retention audit', () => {
  it('should not audit an update inside the retention context that changes nothing', async () => {
    const w = await retentionWorld();
    const profile = await sqlProfile(w.org);
    const audited = `itap.audit_log where entity = 'profiles' and entity_id = '${profile}'`;
    const before = await count(audited);
    await inRetentionContext(`update itap.profiles set first_name = first_name where id = '${profile}'`);
    expect(await count(audited)).toBe(before);
    await inRetentionContext(`update itap.profiles set notes = 'changed' where id = '${profile}'`);
    expect(await count(audited)).toBe(before + 1);
  });
});

describe('Orphan file sweep', () => {
  it.each([
    ['reports', 'report_id'],
    ['bulk_jobs', 'bulk_job_id'],
    ['export_jobs', 'export_job_id'],
  ])('should not stall the %s orphan sweep on an orphan file that is still in use', async (cls, key) => {
    const w = await retentionWorld();
    const gone = randomUUID();
    const used = await fileRow(w.org, 'identity_photo', { [key]: gone });
    await runSql(`update itap.identities set primary_photo_file_id = '${used}' where id = '${await sqlIdentity(w.org)}'`);
    const free = await fileRow(w.org, 'misc', { [key]: gone });
    await runSql(`update storage.files set created_at = now() - interval '40 days' where id in ('${used}', '${free}')`);
    await purge(cls, w.org, ago(30), { limit: 1 });
    expect(await queued(free)).toBe(true);
    expect(await queued(used)).toBe(false);
  });
});

describe('HR fixture files', () => {
  it('should audit opening an integration fixture (view_sensitive)', async () => {
    const w = await retentionWorld();
    const file = await uploadFixture(w.org, '[]');
    await w.a.request(`mutation($f: uuid!) { open_file(file_id: $f) { url } }`, { f: file });
    expect(await count(`itap.audit_log where organization_id = '${w.org}' and action = 'view_sensitive' and entity_id = '${file}'`)).toBe(1);
  });
});
