import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { IDENTITY_RELATIONSHIP_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { IDENTITY_RELATIONS, IDENTITY_RELATION_ENUM } from '../../enums/identity-governance';
import { rangeValidator } from '../../fields/bounded-number';

/** The relation, how sure it is and the note: what a relationship says, edited in place. */
export const relationshipDetailFields = {
  relation: enumField(IDENTITY_RELATIONS, IDENTITY_RELATION_ENUM, {
    required: true,
    default: 'related',
    texts: {
      label: 'Relation',
      doc: { summary: 'How the two are related: usually seen together (companion), family or colleagues (related), or other.' },
    },
  }),
  confidence: f.number({
    nullable: true,
    min: 0,
    max: 1,
    // The record form does not enforce `min`/`max` (G14): restated as a validator.
    validate: rangeValidator({ min: 0, max: 1 }),
    texts: {
      label: 'Confidence',
      doc: { summary: 'How sure the relationship is, from 0 to 1; empty when nobody rated it.' },
    },
  }),
  note: f.text({
    nullable: true,
    texts: { label: 'Note', doc: { summary: 'What is known about the relationship, such as “sister, picks her up on Fridays”.' } },
  }),
};

/** One side of the pair; the pair is stored once, smaller id first, so the sides carry no meaning. */
const side = (label: string) =>
  f.relation({
    to: IDENTITY_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label, doc: { summary: `The ${label.toLowerCase()} of the pair; the order carries no meaning.` } },
  });

/** Columns of `itap.identity_relationships` the `org_admin` role reads (`organization_id` left out). */
export const identityRelationshipFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  identity_a_id: side('One identity'),
  identity_b_id: side('Other identity'),
  ...relationshipDetailFields,
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * A relationship between two identities. Added from either identity ("Add relationship", which
 * stores the pair once whatever the order), listed on both identities' Relationships tab, and
 * changed or removed here. Removing it removes only the relationship.
 */
export const identityRelationship = defineResource(IDENTITY_RELATIONSHIP_RESOURCE, {
  texts: {
    label: 'Identity relationship',
    labelPlural: 'Identity relationships',
    doc: {
      summary:
        'Two identities known to be related: seen together, family, colleagues. Investigations and analytics read it; it changes nothing about matching.',
    },
  },
  // Reached from an identity's Relationships tab: no sidebar entry.
  basePath: '/identity-relationships',
  displayField: 'relation',
  recordTitle: () => 'Identity relationship',
  data: { provider: 'hasura' },
  // Added through "Add relationship" on an identity, which orders the pair.
  operations: { create: false },
  fields: identityRelationshipFields,
  views: {
    list: {
      page: false,
      columns: ['identity_a_id', 'identity_b_id', 'relation', 'confidence', 'note'],
    },
    show: {
      header: (l) => [l.grid(['relation', 'confidence'])],
      body: (l) => [l.grid(['identity_a_id', 'identity_b_id']), 'note', l.grid(['created_at', 'updated_at'])],
    },
    edit: { body: (l) => [l.grid(['identity_a_id', 'identity_b_id']), l.grid(['relation', 'confidence']), 'note'] },
  },
});
