import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What "Rotate key" opens once the key exists (`then.open`): the key's prefix and its secret,
 * straight from the action's answer. The secret lives only in this open flow's memory: it is
 * not cached, not in the URL, not stored, and no read of the platform returns it again (the
 * database keeps a fingerprint and a ciphertext no role may select). Closing the dialog or
 * reloading the page loses it for good.
 */
export const clientKeySecretBlock = defineBlock('itap:client-key-secret', {
  texts: {
    label: 'New API key',
    warning:
      'Copy the secret now and store it in the integration’s secret store. It is shown only this once: it cannot be read again, not even by an administrator. If it is lost, revoke this key and rotate again.',
    prefix: 'Prefix',
    secret: 'Secret',
    expires: 'Expires {{expiresAt}}.',
    noExpiry: 'This key does not expire; revoke it when the integration no longer uses it.',
    overlap: 'An older active key keeps working until you revoke it: revoke it once the integration signs with the new one.',
    copy: 'Copy secret',
    copied: 'Secret copied',
    copyFailed: 'Could not copy the secret; select it in the field and copy it by hand.',
  },
  props: {
    prefix: prop(z.string()),
    secret: prop(z.string()),
    expiresAt: prop(z.string().nullable().optional()).default(null),
  },
});
