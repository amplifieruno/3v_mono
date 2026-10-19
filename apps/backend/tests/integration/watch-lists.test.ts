import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { MERGE, newProfile, pgArray, UPDATE_IDENTITY } from './support/lifecycle.js';
import { insertOne, updateByPk } from './support/operations.js';
import { listEntry } from './support/stageB.js';
import { runSqlRows } from './support/sql.js';

const BLACKLISTED = `query($id: uuid!) { profiles_by_pk(id: $id) { is_blacklisted } }`;

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const blacklist = await insertOne<{ id: string; kind: string; severity: string }>(
    a,
    'watch_lists',
    { name: 'Blacklist', kind: 'blacklist', severity: 'critical', color: '#d00000' },
    'id kind severity',
  );
  const watch = await insertOne(a, 'watch_lists', { name: 'Watch', kind: 'watch' });
  const profile = await newProfile(user.id, orgA.id);
  return { orgA, orgB, user, other, a, blacklist, watch, profile };
}

async function isBlacklisted(client: ReturnType<typeof asOrgAdmin>, profileId: string): Promise<boolean> {
  const data = await client.request<{ profiles_by_pk: { is_blacklisted: boolean } }>(BLACKLISTED, { id: profileId });
  return data.profiles_by_pk.is_blacklisted;
}

describe('watch lists', () => {
  it('should default severity to medium and stamp added_by with the session member', async () => {
    const s = await setup();
    expect(s.blacklist).toMatchObject({ kind: 'blacklist', severity: 'critical' });
    const list = await insertOne<{ severity: string }>(s.a, 'watch_lists', { name: 'VIP', kind: 'vip' }, 'severity');
    expect(list.severity).toBe('medium');
    const entry = await insertOne<{ added_by: string }>(
      s.a,
      'watch_list_entries',
      { watch_list_id: s.watch.id, profile_id: s.profile, reason: 'observed' },
      'added_by',
    );
    expect(entry.added_by).toBe(s.user.id);
  });

  it('should require exactly one of identity and profile and reject duplicates per list', async () => {
    const s = await setup();
    const identity = await createIdentity(s.user.id, s.orgA.id);
    const none = await expectError(insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id }));
    expect(none.message).toMatch(/watch_list_entries_exactly_one_subject/);
    const both = await expectError(
      insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, identity_id: identity.id, profile_id: s.profile }),
    );
    expect(both.message).toMatch(/watch_list_entries_exactly_one_subject/);
    await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, identity_id: identity.id });
    const dup = await expectError(insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, identity_id: identity.id }));
    expect(dup.message).toMatch(/watch_list_entries_identity_key|unique|Uniqueness/i);
  });

  it('should not reference another organization (composite FKs)', async () => {
    const s = await setup();
    const foreignProfile = await newProfile(s.other.id, s.orgB.id);
    const err = await expectError(insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, profile_id: foreignProfile }));
    expect(err.message).toMatch(/foreign key|Foreign key/i);
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    const foreign = await b.request<{ watch_lists: unknown[]; watch_list_entries: unknown[] }>(
      `query { watch_lists { id } watch_list_entries { id } }`,
    );
    expect(foreign).toEqual({ watch_lists: [], watch_list_entries: [] });
  });
});

describe('profiles.is_blacklisted', () => {
  it('should be true for an unexpired blacklist entry of the profile and false for other kinds', async () => {
    const s = await setup();
    expect(await isBlacklisted(s.a, s.profile)).toBe(false);
    await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.watch.id, profile_id: s.profile });
    expect(await isBlacklisted(s.a, s.profile)).toBe(false);
    const entry = await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.blacklist.id, profile_id: s.profile });
    expect(await isBlacklisted(s.a, s.profile)).toBe(true);
    await updateByPk(s.a, 'watch_list_entries', entry.id, { expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await isBlacklisted(s.a, s.profile)).toBe(false);
    await updateByPk(s.a, 'watch_list_entries', entry.id, { expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(await isBlacklisted(s.a, s.profile)).toBe(true);
  });

  it('should be true through a linked identity and stay true after that identity is merged (entry follows)', async () => {
    const s = await setup();
    const listed = await createIdentity(s.user.id, s.orgA.id);
    const target = await createIdentity(s.user.id, s.orgA.id);
    await s.a.request(UPDATE_IDENTITY, { id: listed.id, set: { profile_id: s.profile } });
    await insertOne(s.a, 'watch_list_entries', { watch_list_id: s.blacklist.id, identity_id: listed.id });
    expect(await isBlacklisted(s.a, s.profile)).toBe(true);
    // Merged into an unlinked target: the target inherits the profile and the entry (spec Review Focus #5).
    await s.a.request(MERGE, { target: target.id, sources: pgArray([listed.id]) });
    const [row] = await runSqlRows(`select status from itap.identities where id = '${listed.id}'`);
    expect(row.status).toBe('merged');
    expect(await isBlacklisted(s.a, s.profile)).toBe(true);
    const lists = await runSqlRows(
      `select kind from itap.identity_watch_lists('${s.orgA.id}', '${target.id}', now())`,
    );
    expect(lists.map((r) => r.kind)).toEqual(['blacklist']);
  });

  it('should list the active watch lists of an identity at a point in time (helper for Stage B)', async () => {
    const s = await setup();
    const identity = await createIdentity(s.user.id, s.orgA.id);
    await s.a.request(UPDATE_IDENTITY, { id: identity.id, set: { profile_id: s.profile } });
    // Entries count from their created_at (dated before the probe times here).
    await listEntry(s.a, { watch_list_id: s.watch.id, identity_id: identity.id }, '2026-01-02T00:00:00Z');
    await listEntry(
      s.a,
      { watch_list_id: s.blacklist.id, profile_id: s.profile, expires_at: '2026-01-10T00:00:00Z' },
      '2026-01-04T00:00:00Z',
    );
    const at = async (ts: string): Promise<string[]> =>
      (
        await runSqlRows(
          `select kind from itap.identity_watch_lists('${s.orgA.id}', '${identity.id}', '${ts}') order by kind`,
        )
      ).map((r) => r.kind ?? '');
    expect(await at('2026-01-01T00:00:00Z')).toEqual([]);
    expect(await at('2026-01-03T00:00:00Z')).toEqual(['watch']);
    expect(await at('2026-01-05T00:00:00Z')).toEqual(['blacklist', 'watch']);
    expect(await at('2026-01-11T00:00:00Z')).toEqual(['watch']);
    // Another organization never sees the lists.
    expect(
      await runSqlRows(`select * from itap.identity_watch_lists('${s.orgB.id}', '${identity.id}', '2026-01-05T00:00:00Z')`),
    ).toEqual([]);
  });
});
