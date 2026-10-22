import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What an enrollment flow opens when the action answered (`then.open`): the identity the photos
 * went to, how many were added, its face templates, and every refused photo with its thumbnail
 * and the reason, so a partly accepted request never passes as a full one (Review Focus 1).
 */
export const enrollmentResultBlock = defineBlock('itap:enrollment-result', {
  texts: {
    label: 'Enrollment result',
    added: '{{count}} of {{total}} photos added to {{code}}.',
    noneAdded: 'No photo was added to {{code}}.',
    templates: 'The identity now has {{count}} face templates.',
    open: 'Open {{code}}',
    rejectedTitle: 'Refused photos',
    rejectedIntro: 'These photos were not saved. Retake them and use Add photos on the identity to try again.',
    rejectedPhoto: 'Photo {{index}}',
    reason: 'Photo {{index}}: {{reason}}',
    allAccepted: 'Every photo was accepted.',
  },
  props: {
    identityId: prop(z.string()),
    identityCode: prop(z.string()),
    photosAdded: prop(z.number()),
    templates: prop(z.number()),
    rejected: prop(z.array(z.object({ file_id: z.string(), reason: z.string() }))),
    /** The photos as the form listed them, to number the refused ones as the form did. */
    photoIds: prop(z.array(z.string())).default([]),
  },
});
