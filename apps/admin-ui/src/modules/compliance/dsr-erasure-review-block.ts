import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * What an erasure will do (`itap:dsr-erasure-review`), shown in "New erasure request" below the
 * chosen person and again on its review step: the person (name, code, identities), what is
 * erased, and each legal hold in force that covers them, in which case the erasure keeps what
 * the hold covers and completes partially. Reads the form's person by default.
 */
export const dsrErasureReviewBlock = defineBlock('itap:dsr-erasure-review', {
  texts: {
    label: 'Erasure review',
    choose: 'Choose the person to see what will be erased.',
    loading: 'Reading the person…',
    missing: 'The person cannot be read: they may have been deleted.',
    subject: 'Erasing {{name}} ({{code}}) and {{identities}} linked identities.',
    erased: 'This person was already erased: a new erasure finds nothing more to erase.',
    restricted: 'Processing of this person is already restricted.',
    erasesTitle: 'What will be erased',
    erases:
      'Detections and their snapshots, locations, tracking sessions, events, access decisions, face authentication attempts and evidence, notification and webhook deliveries naming them, face searches, export jobs, bulk job rows (archived);|Photos and face templates, and the identities no kept row refers to;|Mentions in saved searches, reports, incidents, visits, consents, documents and the audit log (redacted);|The profile itself becomes a tombstone named "Erased subject", inactive and restricted; files are deleted within about 10 minutes.',
    irreversible: 'Erasure cannot be undone. Processing is restricted at once, before anything is erased.',
    heldTitle: 'Kept under a legal hold',
    held:
      'A legal hold in force covers this person: the erasure keeps what the hold covers and completes as partial, naming what was kept and which holds kept it.',
    notHeld: 'No legal hold in force names this person or their identities: everything above is erased.',
    holdPeriod: 'in force since {{since}}, {{until}}',
    untilFurther: 'until further notice',
    until: 'until {{at}}',
  },
  props: {
    profileId: prop(z.string().nullable().optional()).default(ref('values', 'profile_id')),
  },
});
