import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { IDENTITY_RELATIONSHIP_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { PEOPLE_BINDING } from './profile-activity';

const side = z.object({
  id: z.string(),
  code: z.string(),
  status: z.string(),
  primary_photo_file_id: z.string().nullable(),
});

export const relationshipRow = z.object({
  id: z.string(),
  relation: z.string(),
  confidence: z.number().nullable(),
  note: z.string().nullable(),
  identity_a: side,
  identity_b: side,
});

/** A relationship seen from one identity: the other identity, the relation and its note. */
export const relatedIdentity = z.object({
  id: z.string(),
  relation: z.string(),
  confidence: z.number().nullable(),
  note: z.string().nullable(),
  other: side,
});

export type RelatedIdentity = z.infer<typeof relatedIdentity>;

const relationshipsInput = z.object({ identityId: z.string().uuid() });

export type RelationshipRow = z.infer<typeof relationshipRow>;

/** The relationships seen from `identityId` (the pair is stored once, in either order). */
export function relatedFrom(rows: readonly RelationshipRow[], identityId: string): RelatedIdentity[] {
  return rows.map(({ identity_a, identity_b, ...rest }) => ({
    ...rest,
    other: identity_a.id === identityId ? identity_b : identity_a,
  }));
}

export const identityRelationshipsOperation = hasuraOperation(PEOPLE_BINDING, 'identityRelationships', {
  kind: 'query',
  document: `query IdentityRelationships($identity: uuid!) {
  identity_relationships(
    where: { _or: [{ identity_a_id: { _eq: $identity } }, { identity_b_id: { _eq: $identity } }] }
    order_by: { created_at: desc }
  ) {
    id
    relation
    confidence
    note
    identity_a { id code status primary_photo_file_id }
    identity_b { id code status primary_photo_file_id }
  }
}`,
  variables: (input) => ({ identity: (input as z.infer<typeof relationshipsInput>).identityId }),
  mapResult: (data) => {
    const rows = rootOf(data, 'identity_relationships');
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const parsed = relationshipRow.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  },
});

/** Every relationship of one identity, whichever side of the stored pair it is on. */
export const identityRelationships = defineQuery('itap:identity-relationships', {
  binding: identityRelationshipsOperation.binding,
  input: schema(relationshipsInput),
  output: schema(z.array(relationshipRow)),
  reads: [resourceByName(IDENTITY_RELATIONSHIP_RESOURCE), resourceByName(IDENTITY_RESOURCE)],
});
