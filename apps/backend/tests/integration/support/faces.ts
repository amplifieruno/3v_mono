import { createHasuraClient, type HasuraClient } from '../../../src/hasura/client.js';
import { asOrgAdmin, testEnv } from './clients.js';

export const EMBEDDING_DIM = 512;

/** pgvector text literal `[x,y,…]`. */
export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

/** Unit vector along axis `axisIndex` (512 dims). */
export function axis(axisIndex: number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === axisIndex ? 1 : 0));
}

/** Unit vector whose cosine distance to `axis(from)` is exactly `distance` (rotated towards `axis(to)`). */
export function atDistance(from: number, to: number, distance: number): number[] {
  const cos = 1 - distance;
  const sin = Math.sqrt(1 - cos * cos);
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === from ? cos : i === to ? sin : 0));
}

/**
 * Admin secret with role `admin` and, optionally, a forwarded `x-hasura-organization-id` (the action handler
 * `actor` shape: permissions bypassed, session variables still passed to triggers and tracked functions).
 */
export function asAdminWithSession(organizationId?: string): HasuraClient {
  return createHasuraClient(testEnv(), { role: 'admin', ...(organizationId ? { organizationId } : {}) });
}

const INSERT_IDENTITY = `
  mutation InsertIdentity($object: identities_insert_input!) { insert_identities_one(object: $object) { id code } }
`;
const INSERT_EMBEDDING = `
  mutation InsertEmbedding($object: identity_embeddings_insert_input!) {
    insert_identity_embeddings_one(object: $object) { id }
  }
`;

export async function createIdentity(
  userId: string,
  orgId: string,
  object: Record<string, unknown> = {},
): Promise<{ id: string; code: string }> {
  const data = await asOrgAdmin(userId, orgId).request<{ insert_identities_one: { id: string; code: string } }>(
    INSERT_IDENTITY,
    { object },
  );
  return data.insert_identities_one;
}

/** Inserts an embedding the way the backend does (admin secret + the caller's org session). */
export async function addEmbedding(orgId: string, identityId: string, values: number[], qualityScore: number): Promise<string> {
  const data = await asAdminWithSession(orgId).request<{ insert_identity_embeddings_one: { id: string } }>(
    INSERT_EMBEDDING,
    {
      object: {
        organization_id: orgId,
        identity_id: identityId,
        embedding: vectorLiteral(values),
        quality_score: qualityScore,
      },
    },
  );
  return data.insert_identity_embeddings_one.id;
}
