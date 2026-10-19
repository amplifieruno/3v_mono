import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs } from './support/fixtures.js';
import { MERGE, newProfile, pgArray, ROLLBACK, UPDATE_IDENTITY, type MergeRow } from './support/lifecycle.js';
import { insertOne } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

type Entry = { id: string; watch_list_id: string; identity_id: string; expires_at: string };

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const blacklist = await insertOne(a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
  const watch = await insertOne(a, 'watch_lists', { name: 'Watch', kind: 'watch' });
  const source = await createIdentity(user.id, orgA.id);
  const target = await createIdentity(user.id, orgA.id);
  return { orgA, user, a, blacklist, watch, source, target };
}

async function entries(orgId: string): Promise<Entry[]> {
  return (await runSqlRows(
    `select id, watch_list_id, identity_id, coalesce(expires_at::text, 'none') as expires_at
     from itap.watch_list_entries where organization_id = '${orgId}' order by id`,
  )) as Entry[];
}

async function merge(s: Awaited<ReturnType<typeof setup>>): Promise<MergeRow> {
  const data = await s.a.request<{ merge_identities: MergeRow[] }>(MERGE, {
    target: s.target.id,
    sources: pgArray([s.source.id]),
  });
  return data.merge_identities[0];
}

describe('watch list entries follow identity merges', () => {
  it('should move source entries to the target and move exactly those back on rollback', async () => {
    const s = await setup();
    const moved = await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.blacklist.id, identity_id: s.source.id });
    const own = await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, identity_id: s.target.id });
    const before = await entries(s.orgA.id);
    const m = await merge(s);
    const after = await entries(s.orgA.id);
    expect(after.find((e) => e.id === moved.id)?.identity_id).toBe(s.target.id);
    expect(after.find((e) => e.id === own.id)?.identity_id).toBe(s.target.id);
    const moves = await runSqlRows(
      `select row_id, from_identity_id from itap.identity_merge_moves where merge_id = '${m.id}' and entity = 'watch_list_entries'`,
    );
    expect(moves).toEqual([{ row_id: moved.id, from_identity_id: s.source.id }]);
    await s.a.request(ROLLBACK, { id: m.id });
    expect(await entries(s.orgA.id)).toEqual(before);
  });

  it('should keep one entry per list on conflict (no expiry wins) and restore both on rollback', async () => {
    const s = await setup();
    const sourceEntry = await insertOne(s.a, 'watch_list_entries', {
      watch_list_id: s.blacklist.id,
      identity_id: s.source.id,
    });
    const targetEntry = await insertOne(s.a, 'watch_list_entries', {
      watch_list_id: s.blacklist.id,
      identity_id: s.target.id,
      expires_at: '2099-01-01T00:00:00Z',
      reason: 'temporary ban',
    });
    const before = await entries(s.orgA.id);
    const m = await merge(s);
    const after = await entries(s.orgA.id);
    expect(after).toEqual([{ ...before.find((e) => e.id === sourceEntry.id), identity_id: s.target.id }]);
    await s.a.request(ROLLBACK, { id: m.id });
    expect(await entries(s.orgA.id)).toEqual(before);
    const [restored] = await runSqlRows(`select reason from itap.watch_list_entries where id = '${targetEntry.id}'`);
    expect(restored.reason).toBe('temporary ban');
  });

  it('should keep the later expiry when both entries expire', async () => {
    const s = await setup();
    await insertOne(s.a, 'watch_list_entries', {
      watch_list_id: s.watch.id,
      identity_id: s.source.id,
      expires_at: '2099-06-01T00:00:00Z',
    });
    await insertOne(s.a, 'watch_list_entries', {
      watch_list_id: s.watch.id,
      identity_id: s.target.id,
      expires_at: '2099-01-01T00:00:00Z',
    });
    await merge(s);
    const after = await entries(s.orgA.id);
    expect(after).toHaveLength(1);
    expect(after[0].expires_at.startsWith('2099-06-01')).toBe(true);
  });
});

describe('watch list entries follow profile merges', () => {
  it('should move profile entries to the target profile, keeping one per list', async () => {
    const s = await setup();
    const source = await newProfile(s.user.id, s.orgA.id);
    const target = await newProfile(s.user.id, s.orgA.id);
    await s.a.request(UPDATE_IDENTITY, { id: s.source.id, set: { profile_id: source } });
    await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.blacklist.id, profile_id: source });
    await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, profile_id: source });
    await insertOne(s.a, 'watch_list_entries', {
      watch_list_id: s.watch.id,
      profile_id: target,
      expires_at: '2099-01-01T00:00:00Z',
    });
    await s.a.request(`mutation($t: uuid!, $s: uuid!) { merge_profiles(args: { p_target: $t, p_source: $s }) { id } }`, {
      t: target,
      s: source,
    });
    const rows = await runSqlRows(
      `select profile_id, coalesce(expires_at::text, 'none') as expires_at from itap.watch_list_entries
       where organization_id = '${s.orgA.id}' order by watch_list_id = '${s.blacklist.id}' desc`,
    );
    expect(rows).toEqual([
      { profile_id: target, expires_at: 'none' },
      { profile_id: target, expires_at: 'none' },
    ]);
    const blacklisted = await s.a.request<{ profiles_by_pk: { is_blacklisted: boolean } }>(
      `query($id: uuid!) { profiles_by_pk(id: $id) { is_blacklisted } }`,
      { id: target },
    );
    expect(blacklisted.profiles_by_pk.is_blacklisted).toBe(true);
  });
});
