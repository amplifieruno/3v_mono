import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { IDENTITY_RELATIONSHIP_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';
import { IDENTITY_RELATIONS } from '../../enums/identity-governance';
import { PEOPLE_BINDING } from './profile-activity';

export const addRelationshipInput = z.object({
  identityId: z.string().uuid(),
  otherId: z.string().uuid(),
  relation: z.enum(IDENTITY_RELATIONS),
  confidence: z.number().min(0).max(1).nullable().optional(),
  note: z.string().nullable().optional(),
});

/**
 * The stored pair: the table keeps every pair once, smaller id first
 * (`identity_relationships_ordered_pair`), so either identity may start the relationship.
 */
export function orderedPair(one: string, other: string): { readonly a: string; readonly b: string } {
  return one < other ? { a: one, b: other } : { a: other, b: one };
}

/** `insert_identity_relationships_one` with the pair ordered (org_admin). */
export const addRelationshipOperation = hasuraOperation(
  PEOPLE_BINDING,
  'addIdentityRelationship',
  {
    kind: 'mutation',
    document: `mutation AddIdentityRelationship(
  $a: uuid!
  $b: uuid!
  $relation: identity_relations_enum!
  $confidence: Float
  $note: String
) {
  insert_identity_relationships_one(
    object: { identity_a_id: $a, identity_b_id: $b, relation: $relation, confidence: $confidence, note: $note }
  ) {
    id
  }
}`,
    variables: (input) => {
      const { identityId, otherId, relation, confidence, note } = input as z.infer<typeof addRelationshipInput>;
      const { a, b } = orderedPair(identityId, otherId);
      const text = note?.trim() ?? '';
      return { a, b, relation, confidence: confidence ?? null, note: text === '' ? null : text };
    },
    mapResult: (data) => rootOf(data, 'insert_identity_relationships_one') ?? null,
  },
  sqlRefusals({
    identity_relationships_pair_key:
      'These two identities are already related: open that relationship to change it. Nothing was saved.',
    identity_relationships_ordered_pair: 'An identity cannot be related to itself. Nothing was saved.',
    identity_relationships_confidence_range: 'The confidence must be between 0 and 1. Nothing was saved.',
  }),
);

/**
 * Records that two identities are related (seen together, family, colleagues). One row per pair,
 * whichever identity it is added from; changed or removed from the relationship itself.
 */
export const addIdentityRelationship = defineMutation('itap:add-identity-relationship', {
  binding: addRelationshipOperation.binding,
  input: schema(addRelationshipInput),
  output: schema(z.object({ id: z.string() }).nullable()),
  effects: [{ resource: IDENTITY_RELATIONSHIP_RESOURCE }],
});
