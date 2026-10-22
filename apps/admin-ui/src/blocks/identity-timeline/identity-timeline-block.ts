import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * Where and when an identity was (`itap:identity-timeline`), newest first and grouped by day:
 * arrivals at and departures from a facility, each area it was seen in (entering or moving), its
 * events (access decisions, alerts) and its visits' check-in and check-out, each with the place
 * (facility, area, access point) and the camera. Entries of identities merged into this one are
 * included and marked. Prop `identityId` (the identity page passes its record).
 */
export const identityTimelineBlock = defineBlock('itap:identity-timeline', {
  texts: {
    label: 'Timeline',
    loading: 'Reading the timeline…',
    failed: 'The timeline could not be read.',
    none: 'Nothing recorded yet: the timeline fills as cameras see this face.',
    shown: 'The newest {{count}} entries.',
    older: 'Show older',
    unknownPlace: 'unknown place',
    kind_session_started: 'Arrived at {{facility}}',
    kind_session_ended: 'Left {{facility}}',
    kind_session_lost: 'Lost from sight at {{facility}}',
    kind_entry: 'Entered {{area}}',
    kind_exit: 'Left {{area}}',
    kind_location: 'Seen in {{area}}',
    kind_visit_checked_in: 'Checked in for visit {{code}}',
    kind_visit_checked_out: 'Checked out of visit {{code}}',
    kind_event: '{{title}}',
    at: 'at {{name}}',
    camera: 'Camera: {{name}}',
    merged: 'as a merged identity',
  },
  props: {
    identityId: prop(z.string().nullable().optional()).default(null),
  },
});
