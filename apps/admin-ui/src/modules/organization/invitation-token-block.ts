import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What the `invite` flow opens once the invitation exists (`then.open`): the
 * one-time token the action answered and its expiry. The token is shown only
 * here, once; the data layer keeps its hash.
 */
export const invitationTokenBlock = defineBlock('itap:invitation-token', {
  texts: {
    label: 'Invitation token',
    intro:
      'Send this token to the invitee. It is shown only once and cannot be read again; if it is lost, revoke the invitation and invite again.',
    expires: 'Valid until {{expiresAt}}.',
    copy: 'Copy token',
    copied: 'Token copied',
  },
  props: {
    token: prop(z.string()),
    expiresAt: prop(z.string()),
  },
});
