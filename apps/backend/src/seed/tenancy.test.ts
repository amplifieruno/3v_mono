import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { SEED_DISPLAY_NAMES, SEED_EMAILS, upsertUser } from './tenancy.js';

type Call = { query: string; variables: Record<string, unknown> };

/** A Hasura admin client answering FIND_USER with `users` and recording every request. */
function fakeAdmin(users: { id: string; passwordHash: string | null; displayName: string }[]) {
  const calls: Call[] = [];
  const request = async (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });
    if (query.includes('SeedFindUser')) return { users };
    if (query.includes('SeedInsertUser')) return { insertUser: { id: 'new-user' } };
    return {};
  };
  return { admin: { request } as unknown as HasuraClient, calls };
}

describe('upsertUser', () => {
  it('should name every seeded user', () => {
    for (const key of Object.keys(SEED_EMAILS) as (keyof typeof SEED_EMAILS)[]) {
      expect(SEED_DISPLAY_NAMES[key].trim()).not.toBe('');
    }
  });

  it('should insert a missing user with its display name', async () => {
    const { admin, calls } = fakeAdmin([]);
    const id = await upsertUser({ admin }, SEED_EMAILS.novaAdmin, 'secret', 'Nova Admin');
    expect(id).toBe('new-user');
    const insert = calls.find((call) => call.query.includes('SeedInsertUser'));
    expect(insert?.variables.object).toMatchObject({ email: SEED_EMAILS.novaAdmin, displayName: 'Nova Admin' });
  });

  it('should set the display name of an existing user whose name is blank, keeping a matching password', async () => {
    const hash = await bcrypt.hash('secret', 4);
    const { admin, calls } = fakeAdmin([{ id: 'u1', passwordHash: hash, displayName: '' }]);
    await upsertUser({ admin }, SEED_EMAILS.admin, 'secret', 'Org Admin');
    const update = calls.find((call) => call.query.includes('SeedUpdateUser'));
    expect(update?.variables).toEqual({ id: 'u1', set: { displayName: 'Org Admin' } });
  });

  it('should leave an existing display name and a matching password alone', async () => {
    const hash = await bcrypt.hash('secret', 4);
    const { admin, calls } = fakeAdmin([{ id: 'u1', passwordHash: hash, displayName: 'Chosen Name' }]);
    await upsertUser({ admin }, SEED_EMAILS.admin, 'secret', 'Org Admin');
    expect(calls.some((call) => call.query.includes('SeedUpdateUser'))).toBe(false);
  });

  it('should rewrite a stale password hash without touching a set display name', async () => {
    const { admin, calls } = fakeAdmin([{ id: 'u1', passwordHash: null, displayName: 'Chosen Name' }]);
    await upsertUser({ admin }, SEED_EMAILS.admin, 'secret', 'Org Admin');
    const update = calls.find((call) => call.query.includes('SeedUpdateUser'));
    const set = update?.variables.set as { passwordHash?: string; displayName?: string };
    expect(set.displayName).toBeUndefined();
    expect(await bcrypt.compare('secret', set.passwordHash ?? '')).toBe(true);
  });
});
