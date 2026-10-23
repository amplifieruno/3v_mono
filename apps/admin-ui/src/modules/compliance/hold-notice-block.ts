import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

const id = prop(z.string().nullable().optional()).default(null);

/**
 * The legal hold notice (`itap:legal-hold-notice`) heading a held profile, identity or incident:
 * each hold in force that covers the record (directly or through its linked profile, identities
 * or facility), linked to the hold. Draws nothing when none does. Props: the record's own id
 * under its kind, plus what it is linked to.
 */
export const legalHoldNoticeBlock = defineBlock('itap:legal-hold-notice', {
  texts: {
    label: 'Legal hold',
    title: 'Under legal hold',
    profile:
      'This person’s data is kept from retention and erasure while the hold is in force: an erasure request completes partially, and nothing about them is purged.',
    identity:
      'This identity’s data (and its profile’s) is kept from retention and erasure while the hold is in force.',
    incident: 'This incident, its notes, activities, events and reports are kept from retention while the hold is in force.',
    period: '— in force since {{since}}, {{until}}.',
    untilFurther: 'until further notice',
    until: 'until {{at}}',
    viaFacility: '(covers its facility)',
    viaLink: '(covers a linked record)',
    reach:
      'Shown: holds that name this record or a record directly linked to it. A hold can also reach it further away (completed merges, other identities of the same person, a held person an incident names); the retention plan and runs count those rows as kept.',
  },
  props: {
    profileId: id,
    identityId: id,
    incidentId: id,
    linkedProfileId: id,
    facilityId: id,
  },
});
