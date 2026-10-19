import { asOrgAdmin, orgAdminToken } from './clients.js';
import { addEmbedding, axis } from './faces.js';
import { uploadFile } from './fixtures.js';
import { runSqlRows } from './sql.js';

/** Postgres array literal for uuid[] function arguments (Hasura `_uuid` scalar). */
export function pgArray(ids: string[]): string {
  return `{${ids.join(',')}}`;
}

export const MERGE = `
  mutation Merge($target: uuid!, $sources: _uuid!, $reason: String) {
    merge_identities(args: { p_target: $target, p_sources: $sources, p_reason: $reason }) {
      id status target_identity_id merged_by reason
    }
  }
`;
export const ROLLBACK = `
  mutation Rollback($id: uuid!) {
    rollback_merge(args: { p_merge_id: $id }) { id status rolled_back_by rolled_back_at }
  }
`;
export const SPLIT = `
  mutation Split($id: uuid!, $embeddings: _uuid!, $photos: _uuid!) {
    split_identity(args: { p_identity: $id, p_embedding_ids: $embeddings, p_photo_ids: $photos }) {
      id code status source profile_id
    }
  }
`;
export const UPDATE_IDENTITY = `
  mutation UpdateIdentity($id: uuid!, $set: identities_set_input!) {
    update_identities(where: { id: { _eq: $id } }, _set: $set) { affected_rows }
  }
`;
export const INSERT_PROFILE = `mutation($object: profiles_insert_input!) { insert_profiles_one(object: $object) { id } }`;
export const PROFILE_COUNT = `query($id: uuid!) { profiles_by_pk(id: $id) { identities_count has_face } }`;

export type MergeRow = {
  id: string;
  status: string;
  target_identity_id: string;
  merged_by: string | null;
  reason: string | null;
};
export type IdentityState = {
  status: string;
  profile_id: string | null;
  is_primary_for_profile: boolean;
};

export async function newProfile(userId: string, orgId: string): Promise<string> {
  const data = await asOrgAdmin(userId, orgId).request<{
    insert_profiles_one: { id: string };
  }>(INSERT_PROFILE, {
    object: { first_name: 'Ann', last_name: 'Lee' },
  });
  return data.insert_profiles_one.id;
}

/** Adds one photo (own-bucket PNG) to the identity as org_admin; returns the photo id. */
export async function addPhoto(userId: string, orgId: string, identityId: string): Promise<string> {
  const file = await uploadFile(orgAdminToken(userId, orgId), orgId, undefined, 'image/png');
  if (!('id' in file)) throw new Error(`upload failed: ${file.status}`);
  const data = await asOrgAdmin(userId, orgId).request<{
    insert_identity_photos_one: { id: string };
  }>(`mutation($o: identity_photos_insert_input!) { insert_identity_photos_one(object: $o) { id } }`, {
    o: { identity_id: identityId, file_id: file.id },
  });
  return data.insert_identity_photos_one.id;
}

/** One photo and one embedding (axis `axisIndex`) on the identity. */
export async function addPhotoAndEmbedding(
  userId: string,
  orgId: string,
  identityId: string,
  axisIndex: number,
): Promise<{ photo: string; embedding: string }> {
  const photo = await addPhoto(userId, orgId, identityId);
  const embedding = await addEmbedding(orgId, identityId, axis(axisIndex), 0.9);
  return { photo, embedding };
}

export async function identityState(id: string): Promise<IdentityState> {
  const [row] = await runSqlRows(
    `select status, coalesce(profile_id::text, '') as profile_id, is_primary_for_profile::text as is_primary
     from itap.identities where id = '${id}'`,
  );
  // run_sql renders SQL NULL as the string "NULL": map through coalesce instead.
  return {
    status: row.status ?? '',
    profile_id: row.profile_id || null,
    is_primary_for_profile: row.is_primary === 'true',
  };
}

/** `{ rowId: identityId }` for the photos and embeddings of the given identities. */
export async function owners(identityIds: string[]): Promise<Record<string, string>> {
  const list = identityIds.map((id) => `'${id}'`).join(',');
  const rows = await runSqlRows(`
    select id, identity_id from itap.identity_photos where identity_id in (${list})
    union all
    select id, identity_id from itap.identity_embeddings where identity_id in (${list})
  `);
  return Object.fromEntries(rows.map((r) => [r.id ?? '', r.identity_id ?? '']));
}

export async function auditRows(
  entityId: string,
): Promise<{ action: string; user_id: string | null; reason: string | null }[]> {
  const rows = await runSqlRows(
    `select action, coalesce(user_id::text, '') as user_id, coalesce(reason, '') as reason from itap.audit_log where entity_id = '${entityId}' order by occurred_at, id`,
  );
  return rows.map((r) => ({
    action: r.action ?? '',
    user_id: r.user_id || null,
    reason: r.reason || null,
  }));
}

/** Inserts an open duplicate candidate for the pair (ordered as the CHECK requires); returns nothing. */
export async function addCandidate(orgId: string, x: string, y: string): Promise<void> {
  const [lo, hi] = x < y ? [x, y] : [y, x];
  await runSqlRows(
    `insert into itap.identity_duplicate_candidates (organization_id, identity_a_id, identity_b_id, similarity)
     values ('${orgId}', '${lo}', '${hi}', 0.8)`,
  );
}

/** Status and merge_id ('' when null) of the candidate for the pair. */
export async function candidateState(x: string, y: string): Promise<{ status: string; merge_id: string | null }> {
  const [lo, hi] = x < y ? [x, y] : [y, x];
  const [row] = await runSqlRows(
    `select status, coalesce(merge_id::text, '') as merge_id from itap.identity_duplicate_candidates
     where identity_a_id = '${lo}' and identity_b_id = '${hi}'`,
  );
  return { status: row.status ?? '', merge_id: row.merge_id || null };
}
