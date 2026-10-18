import bcrypt from 'bcryptjs';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';

export type SeedContext = { env: Env; admin: HasuraClient; storage: StorageClient; now: Date };

export type SeedTenancyResult = {
  users: { admin: string; novaAdmin: string; riversideAdmin: string };
  orgs: { nova: string; riverside: string };
};

export const SEED_EMAILS = {
  admin: 'admin@itap.demo',
  novaAdmin: 'nova.admin@itap.demo',
  riversideAdmin: 'riverside.admin@itap.demo',
} as const;

export const SEED_ORGS = {
  nova: { slug: 'nova-tower', name: 'Nova Tower Business Center' },
  riverside: { slug: 'riverside-office-park', name: 'Riverside Office Park' },
} as const;

const SEED_TIMEZONE = 'Europe/Moscow';
const SEED_LOCALE = 'en';

type UserRow = { id: string; passwordHash: string | null };

const FIND_USER = `
  query SeedFindUser($email: citext!) { users(where: { email: { _eq: $email } }) { id passwordHash } }
`;
const INSERT_USER = `
  mutation SeedInsertUser($object: users_insert_input!) { insertUser(object: $object) { id } }
`;
const UPDATE_USER_HASH = `
  mutation SeedUpdateUser($id: uuid!, $hash: String!) {
    updateUser(pk_columns: { id: $id }, _set: { passwordHash: $hash }) { id }
  }
`;

/** Creates the user when missing; only rewrites the password hash if the stored one no longer matches. */
async function upsertUser(ctx: SeedContext, email: string, password: string): Promise<string> {
  const { users } = await ctx.admin.request<{ users: UserRow[] }>(FIND_USER, { email });
  const existing = users[0];
  if (existing) {
    const matches = existing.passwordHash ? await bcrypt.compare(password, existing.passwordHash) : false;
    if (!matches) {
      await ctx.admin.request(UPDATE_USER_HASH, { id: existing.id, hash: await bcrypt.hash(password, 10) });
    }
    return existing.id;
  }
  const data = await ctx.admin.request<{ insertUser: { id: string } | null }>(INSERT_USER, {
    object: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      defaultRole: 'user',
      locale: SEED_LOCALE,
      emailVerified: true,
      roles: { data: [{ role: 'user' }, { role: 'me' }] },
    },
  });
  if (!data.insertUser) throw new Error(`seed: insertUser returned no row for ${email}`);
  return data.insertUser.id;
}

const FIND_ORG = `
  query SeedFindOrg($slug: String!) { organizations(where: { slug: { _eq: $slug } }) { id } }
`;
const INSERT_ORG = `
  mutation SeedInsertOrg($object: organizations_insert_input!) {
    insert_organizations_one(object: $object) { id }
  }
`;

async function upsertOrg(ctx: SeedContext, org: { slug: string; name: string }): Promise<string> {
  const found = await ctx.admin.request<{ organizations: { id: string }[] }>(FIND_ORG, { slug: org.slug });
  if (found.organizations[0]) return found.organizations[0].id;
  const data = await ctx.admin.request<{ insert_organizations_one: { id: string } | null }>(INSERT_ORG, {
    object: { ...org, timezone: SEED_TIMEZONE, locale: SEED_LOCALE },
  });
  if (!data.insert_organizations_one) throw new Error(`seed: organization insert failed for ${org.slug}`);
  return data.insert_organizations_one.id;
}

const ADD_MEMBERS = `
  mutation SeedAddMembers($objects: [organization_members_insert_input!]!) {
    insert_organization_members(
      objects: $objects
      on_conflict: { constraint: organization_members_organization_id_user_id_key, update_columns: [] }
    ) { affected_rows }
  }
`;

export async function seedTenancy(ctx: SeedContext): Promise<SeedTenancyResult> {
  const password = ctx.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required to seed users');

  const users = {
    admin: await upsertUser(ctx, SEED_EMAILS.admin, password),
    novaAdmin: await upsertUser(ctx, SEED_EMAILS.novaAdmin, password),
    riversideAdmin: await upsertUser(ctx, SEED_EMAILS.riversideAdmin, password),
  };
  const orgs = {
    nova: await upsertOrg(ctx, SEED_ORGS.nova),
    riverside: await upsertOrg(ctx, SEED_ORGS.riverside),
  };

  const member = (organization_id: string, user_id: string) => ({ organization_id, user_id, role: 'admin' });
  await ctx.admin.request(ADD_MEMBERS, {
    objects: [
      member(orgs.nova, users.admin),
      member(orgs.riverside, users.admin),
      member(orgs.nova, users.novaAdmin),
      member(orgs.riverside, users.riversideAdmin),
    ],
  });

  return { users, orgs };
}

const ORG_FILES = `
  query SeedOrgFiles($slugs: [String!]!) {
    organizations(where: { slug: { _in: $slugs } }) { id }
  }
`;
const BUCKET_FILES = `
  query SeedBucketFiles($bucket: String!) { files(where: { bucketId: { _eq: $bucket } }) { id } }
`;
const DELETE_ORGS = `
  mutation SeedDeleteOrgs($slugs: [String!]!) {
    delete_organizations(where: { slug: { _in: $slugs } }) { affected_rows }
  }
`;

/**
 * Deletes the seed organizations (FK cascade) and their storage files. Files go first, through the
 * storage service, so object storage stays consistent. Bucket rows are left in place: the bucket
 * trigger is ON CONFLICT DO NOTHING and a reseeded org gets a fresh id (hence a fresh bucket).
 */
export async function resetTenancy(ctx: SeedContext): Promise<void> {
  const slugs = Object.values(SEED_ORGS).map((o) => o.slug);
  const { organizations } = await ctx.admin.request<{ organizations: { id: string }[] }>(ORG_FILES, { slugs });
  for (const org of organizations) {
    const { files } = await ctx.admin.request<{ files: { id: string }[] }>(BUCKET_FILES, { bucket: org.id });
    for (const file of files) await ctx.storage.deleteFile(file.id);
  }
  await ctx.admin.request(DELETE_ORGS, { slugs });
}
