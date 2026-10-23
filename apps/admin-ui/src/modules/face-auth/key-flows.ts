import { type FlowCheck, type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { CLIENT_APPLICATION_KEY_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { revokeClientKey, rotateClientKey } from './key-ops';
import { clientKeySecretBlock } from './key-secret-block';

/** Whether an expiry the form holds is not in the future (empty: no expiry, fine). */
export function expiryInPast(value: unknown, now: number = Date.now()): boolean {
  if (value === null || value === undefined || value === '') return false;
  const at = new Date(String(value)).getTime();
  return !Number.isNaN(at) && at <= now;
}

const rotateFields = {
  expires_at: dateTime({
    texts: {
      label: 'Expires',
      doc: {
        summary:
          'When the key stops working by itself (requests signed with it are then refused as key expired). Leave empty for a key that works until it is revoked.',
      },
    },
  }),
};

/** The rotate form's check, restating `client_key_expiry_invalid`. */
export const ROTATE_CHECKS: FlowCheck[] = [
  {
    id: 'expiryInFuture',
    severity: 'error',
    anchor: 'expires_at',
    texts: 'The expiry must be in the future, or empty for a key that does not expire.',
    when: ({ values }) => expiryInPast(values.expires_at),
  },
];

/**
 * "Rotate key" on a client application: an optional expiry, then `rotate_client_key`, whose answer
 * opens the secret block (`then.open`, the invitation token's pattern). The secret reaches the
 * block as the flow's result only; once the dialog is closed it is gone. It has a form, so it is
 * not a confirm-only flow (G72). At most two keys are active: a third is refused by the server
 * (`client_key_limit`, a sentence on the form). A lost answer is not retried (a second send would
 * create a second key) and cannot be checked from here (the check sees no answer, so no secret):
 * the unknown screen stands, and a key that landed without its secret is revoked from the list
 * (`tests/check-app.test.ts`).
 */
export const rotateKeyFlow = {
  texts: {
    label: 'Rotate key',
    doc: {
      summary:
        'Creates a new API key for the application and shows its secret once. The other active key keeps working until it is revoked, so the integration can switch without downtime. At most two keys are active.',
    },
  },
  icon: NAV_ICONS.rotateKey,
  surfaces: { default: 'menu', show: 'menu' },
  checks: ROTATE_CHECKS,
  form: { fields: rotateFields },
  submit: {
    mutation: rotateClientKey,
    retry: 'never',
    input: { applicationId: ref('record', 'id'), expiresAt: ref('values', 'expires_at') },
  },
  then: {
    open: {
      block: clientKeySecretBlock,
      props: { prefix: ref('result', 'prefix'), secret: ref('result', 'secret'), expiresAt: ref('result', 'expires_at') },
    },
  },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rotateFields>;

/** Check again after a lost "Revoke key": applied when the key reads revoked. */
export const keyRevoked: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(CLIENT_APPLICATION_KEY_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    const revokedAt = (row as Readonly<Record<string, unknown>>).revoked_at;
    return typeof revokedAt === 'string' && revokedAt !== '' ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "Revoke key" on a key not yet revoked (`revoke_client_key`, which takes no reason), from the key's
 * row on the application's Keys tab: every
 * request signed with it is refused from then on, for good. Revoked is terminal: the flow is no
 * longer offered on a revoked key, and the database refuses a second revocation.
 */
export const revokeKeyFlow = {
  texts: {
    label: 'Revoke key',
    confirm:
      'Revoke this key for good? Every request signed with it is refused from now on and it can never be used again. Make sure the integration already signs with the other key.',
    notify: 'Key {{prefix}} is revoked.',
    doc: {
      summary:
        'Retires a key for good: requests signed with it are refused at once. Use it after a rotation, once the integration uses the new key, or at once for a leaked secret.',
    },
  },
  icon: NAV_ICONS.revokeKey,
  variant: 'destructive',
  // Keys have no page of their own: the row menu of the application's Keys tab only.
  surfaces: { default: 'menu', row: 'menu' },
  when: cond.not(cond.present(ref('record', 'revoked_at'))),
  confirm: true,
  submit: {
    mutation: revokeClientKey,
    // Idempotent in effect: a second send of a revocation that landed is refused as "already revoked".
    retry: 'never',
    input: { keyId: ref('record', 'id') },
    onUnknown: { check: keyRevoked },
  },
  then: { notify: { params: { prefix: ref('result', 'key_prefix') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
