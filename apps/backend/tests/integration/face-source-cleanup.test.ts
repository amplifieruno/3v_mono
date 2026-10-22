import { describe, expect, it } from 'vitest';
import { runSql, runSqlRows } from './support/sql.js';
import { ago, fileRow, insertRow, purge, queued, retentionWorld, sqlIdentity } from './support/retention.js';

/**
 * UI phase 4 final wave (I1, bd 3v_mono-t45): face source photos uploaded by the console for enrollment actions are
 * queued for deletion with their crop (retention, erasure) and by the stale sweep of the drain_file_deletions cron.
 */

const q = (v: string): string => `'${v}'`;

async function sweep(olderThan: string): Promise<string[]> {
  const rows = await runSqlRows(`select file_id from itap.enqueue_stale_face_sources(${olderThan}, 5000)`);
  return rows.map((r) => String(r.file_id));
}

describe('Face source photos: stale sweep', () => {
  it('should queue unused face_source files older than the cutoff and nothing else', async () => {
    const w = await retentionWorld();
    const stale = await fileRow(w.org, 'face_source');
    const fresh = await fileRow(w.org, 'face_source');
    const otherKind = await fileRow(w.org, 'misc');
    const inUse = await fileRow(w.org, 'face_source');
    await runSql(`update itap.identities set primary_photo_file_id = '${inUse}' where id = '${await sqlIdentity(w.org)}'`);
    const otherOrg = await fileRow(w.orgB, 'face_source');
    await runSql(
      `update storage.files set created_at = now() - interval '2 hours' where id in ('${stale}', '${otherKind}', '${inUse}', '${otherOrg}')`,
    );

    const swept = await sweep(`now() - interval '1 hour'`);
    expect(swept).toEqual(expect.arrayContaining([stale, otherOrg]));
    expect(swept).not.toContain(fresh);
    expect(await queued(stale)).toBe(true);
    expect(await queued(otherOrg)).toBe(true);
    expect(await queued(fresh)).toBe(false);
    expect(await queued(otherKind)).toBe(false);
    expect(await queued(inUse)).toBe(false);
    const [row] = await runSqlRows(`select organization_id, reason from itap.pending_file_deletions where file_id = '${stale}'`);
    expect(row).toMatchObject({ organization_id: w.org, reason: 'face_source' });

    // Idempotent: a queued file is not returned again.
    expect(await sweep(`now() - interval '1 hour'`)).not.toContain(stale);
  });

  it('should refuse a missing cutoff or an invalid limit', async () => {
    await expect(runSql(`select * from itap.enqueue_stale_face_sources(null, 10)`)).rejects.toThrow(/face_source_cutoff_required/);
    await expect(runSql(`select * from itap.enqueue_stale_face_sources(now(), 0)`)).rejects.toThrow(/file_deletion_limit_invalid/);
  });
});

describe('Face source photos: with their crop', () => {
  it('should queue the face_source original when its identity photo is purged (retention, DSR erasure)', async () => {
    const w = await retentionWorld();
    // The photos class purges photos of archived unknown identities (erasure: of the subject's identities).
    const identity = await sqlIdentity(w.org, { status: q('archived') });
    const source = await fileRow(w.org, 'face_source');
    const crop = await fileRow(w.org, 'identity_photo', { identity_id: identity, source_file_id: source });
    await insertRow('identity_photos', { organization_id: q(w.org), identity_id: q(identity), file_id: q(crop), kind: q('enrollment') });

    const result = await purge('photos', w.org, ago(-1));
    expect(result.affected).toBe(1);
    expect(result.files_enqueued).toBe(2);
    expect(await queued(crop)).toBe(true);
    expect(await queued(source)).toBe(true);
  });

  it('should leave a source of another kind, another organization or still in use', async () => {
    const w = await retentionWorld();
    const foreign = await fileRow(w.orgB, 'face_source');
    const avatarLike = await fileRow(w.org, 'avatar');
    const used = await fileRow(w.org, 'face_source');
    await runSql(`update itap.identities set primary_photo_file_id = '${used}' where id = '${await sqlIdentity(w.org)}'`);
    const crops = await Promise.all(
      [foreign, avatarLike, used].map((source) => fileRow(w.org, 'identity_photo', { source_file_id: source })),
    );
    const [n] = await runSqlRows(
      `select itap.enqueue_unused_files('${w.org}', array[${crops.map((c) => `'${c}'::uuid`).join(', ')}], 'test') as n`,
    );
    expect(Number(n.n)).toBe(3);
    for (const source of [foreign, avatarLike, used]) expect(await queued(source)).toBe(false);
  });
});
