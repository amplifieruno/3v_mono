import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * The identities one identity is related to (`itap:identity-relationships`), whichever of the two
 * the relationship was added from: the other identity's photo and code (a link to it), the
 * relation, how sure it is and the note. "Open" shows the relationship, where it is changed or
 * removed; "Add relationship" on the identity adds one.
 */
export const identityRelationshipsBlock = defineBlock('itap:identity-relationships', {
  texts: {
    label: 'Relationships',
    loading: 'Reading the relationships…',
    none: 'No related identities yet. Use Add relationship to record one.',
    identity: 'Identity',
    relation: 'Relation',
    confidence: 'Confidence',
    note: 'Note',
    open: 'Open',
    openLabel: 'Open the relationship with {{code}}',
  },
  props: {
    identityId: prop(z.string().nullable().optional()).default(null),
  },
});
