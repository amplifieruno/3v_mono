import bcrypt from 'bcryptjs';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';

export type SeedContext = { env: Env; admin: HasuraClient; storage: StorageClient; now: Date };

export type SeedTenancyResult = {
  users: { admin: string; novaAdmin: string; riversideAdmin: string; operator: string };
  orgs: { nova: string; riverside: string };
};

export const SEED_EMAILS = {
  admin: 'admin@itap.demo',
  novaAdmin: 'nova.admin@itap.demo',
  riversideAdmin: 'riverside.admin@itap.demo',
  // Nova Tower security operator (third member of the on-call rotation, slice 5); Russian interface locale.
  operator: 'operator@itap.demo',
} as const;

export const SEED_ORGS = {
  nova: { slug: 'nova-tower', name: 'Nova Tower Business Center' },
  riverside: { slug: 'riverside-office-park', name: 'Riverside Office Park' },
} as const;

const SEED_TIMEZONE = 'Europe/Moscow';
const SEED_LOCALE = 'en';

/** The names the console shows for the seeded users (auth.users.displayName). */
export const SEED_DISPLAY_NAMES: Record<keyof typeof SEED_EMAILS, string> = {
  admin: 'Org Admin',
  novaAdmin: 'Nova Admin',
  riversideAdmin: 'Riverside Admin',
  operator: 'Security Operator',
};

type UserRow = { id: string; passwordHash: string | null; displayName: string | null };

const FIND_USER = `
  query SeedFindUser($email: citext!) { users(where: { email: { _eq: $email } }) { id passwordHash displayName } }
`;
const INSERT_USER = `
  mutation SeedInsertUser($object: users_insert_input!) { insertUser(object: $object) { id } }
`;
const UPDATE_USER = `
  mutation SeedUpdateUser($id: uuid!, $set: users_set_input!) {
    updateUser(pk_columns: { id: $id }, _set: $set) { id }
  }
`;

/**
 * Creates the user when missing (with its display name); on an existing user only rewrites the
 * password hash if the stored one no longer matches and sets the display name when it is blank.
 */
export async function upsertUser(
  ctx: Pick<SeedContext, 'admin'>,
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const { users } = await ctx.admin.request<{ users: UserRow[] }>(FIND_USER, { email });
  const existing = users[0];
  if (existing) {
    const set: { passwordHash?: string; displayName?: string } = {};
    const matches = existing.passwordHash ? await bcrypt.compare(password, existing.passwordHash) : false;
    if (!matches) set.passwordHash = await bcrypt.hash(password, 10);
    if (!existing.displayName?.trim()) set.displayName = displayName;
    if (Object.keys(set).length > 0) await ctx.admin.request(UPDATE_USER, { id: existing.id, set });
    return existing.id;
  }
  const data = await ctx.admin.request<{ insertUser: { id: string } | null }>(INSERT_USER, {
    object: {
      email,
      displayName,
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

/**
 * The admin belongs to both organizations, so sign-in opens the one they used last; a fresh seed has none (the reset
 * removed it with the organizations) and would stop at the organization picker. Nova Tower, the demo organization, is
 * recorded as last used only while nothing is recorded: a later switch made in the console stays.
 */
const ADMIN_LAST_ORGANIZATION = `
  mutation SeedAdminLastOrganization($user: uuid!, $org: uuid!) {
    insert_user_settings_one(object: { user_id: $user }, on_conflict: { constraint: user_settings_pkey, update_columns: [] }) {
      user_id
    }
    update_user_settings(where: { user_id: { _eq: $user }, last_organization_id: { _is_null: true } }, _set: { last_organization_id: $org }) {
      affected_rows
    }
  }
`;

const OPERATOR_LOCALE = `
  mutation SeedOperatorLocale($user: uuid!) {
    insert_user_settings_one(object: { user_id: $user, locale: "ru" }, on_conflict: { constraint: user_settings_pkey, update_columns: [] }) {
      user_id
    }
  }
`;

export async function seedTenancy(ctx: SeedContext): Promise<SeedTenancyResult> {
  const password = ctx.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required to seed users');

  const users = {
    admin: await upsertUser(ctx, SEED_EMAILS.admin, password, SEED_DISPLAY_NAMES.admin),
    novaAdmin: await upsertUser(ctx, SEED_EMAILS.novaAdmin, password, SEED_DISPLAY_NAMES.novaAdmin),
    riversideAdmin: await upsertUser(ctx, SEED_EMAILS.riversideAdmin, password, SEED_DISPLAY_NAMES.riversideAdmin),
    operator: await upsertUser(ctx, SEED_EMAILS.operator, password, SEED_DISPLAY_NAMES.operator),
  };
  const orgs = {
    nova: await upsertOrg(ctx, SEED_ORGS.nova),
    riverside: await upsertOrg(ctx, SEED_ORGS.riverside),
  };

  const member = (organization_id: string, user_id: string, extra: Record<string, string> = {}) => ({ organization_id, user_id, role: 'admin', ...extra });
  await ctx.admin.request(ADD_MEMBERS, {
    objects: [
      member(orgs.nova, users.admin),
      member(orgs.riverside, users.admin),
      member(orgs.nova, users.novaAdmin),
      member(orgs.riverside, users.riversideAdmin),
      member(orgs.nova, users.operator, { title: 'Security operator', department: 'Security' }),
    ],
  });
  // Notification templates are chosen by the recipient's locale: the operator reads Russian.
  await ctx.admin.request(OPERATOR_LOCALE, { user: users.operator });
  await ctx.admin.request(ADMIN_LAST_ORGANIZATION, { user: users.admin, org: orgs.nova });

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
