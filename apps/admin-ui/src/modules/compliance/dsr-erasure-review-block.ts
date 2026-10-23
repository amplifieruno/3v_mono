import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * What an erasure will do (`itap:dsr-erasure-review`), shown in "New erasure request" below the
 * chosen person and again on its review step: the person (name, code, identities), what is
 * deleted and redacted (as `itap.dsr_erase` does it), and the legal holds in force it honours: a
 * hold on the person or an identity keeps the profile, identities and biometrics (no tombstone, no
 * redaction); a hold on an incident naming them or a facility where they were recorded keeps those
 * rows; either way the request completes partially. Reads the form's person by default.
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
      'Deleted: detections and their snapshots, locations, tracking sessions, events (those kept with an incident lose the person instead), access decisions, face authentication attempts and evidence, notification and webhook deliveries naming them, face searches and saved searches run with their image, export jobs; bulk job rows are archived;|Deleted: photos and face templates, the identities no kept row refers to, their visits, consent records and documents, watch-list entries, segment memberships, access grants no kept decision uses, authentication sessions, notification subscriptions and activity statistics;|Redacted: incidents (the person is unlinked, notes and activities stripped of them), hosted visits, shift handovers, notification digests, reports showing them (expired), their other requests and the audit log;|The profile itself becomes a tombstone named "Erased subject", inactive and restricted; files are deleted within about 10 minutes.',
    irreversible: 'Erasure cannot be undone. Processing is restricted at once, before anything is erased.',
    personHeldTitle: 'The person is under a legal hold',
    personHeld:
      'A hold in force names this person or one of their identities. The profile, identities, photos and face templates are kept, no tombstone is written and mentions are not redacted; the rows the hold covers are kept too. Only what lies outside the hold is erased, and the request completes as partial.',
    placesHeldTitle: 'Kept under a legal hold',
    placesHeld:
      'A hold in force covers an incident naming this person or a facility where they were recorded: the rows under it are kept, everything else above is erased, and the request completes as partial, naming what was kept and which holds kept it.',
    notHeld:
      'No legal hold in force names this person or their identities, an incident naming them, or a facility where they were recorded: everything above is erased. A hold reaching them only through a completed identity merge is still honoured at erasure time (the request then completes as partial).',
    holdsLoading: 'Checking the legal holds…',
    holdsUnknown: 'The legal holds could not be read, so what the erasure keeps is unknown: the request cannot be filed until they can be checked. Reload, or try again later.',
    holdPeriod: 'in force since {{since}}, {{until}}',
    untilFurther: 'until further notice',
    until: 'until {{at}}',
  },
  props: {
    profileId: prop(z.string().nullable().optional()).default(ref('values', 'profile_id')),
  },
});
