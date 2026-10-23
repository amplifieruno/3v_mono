import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { CLIENT_APPLICATION_KEY_RESOURCE, CLIENT_APPLICATION_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { revokeKeyFlow } from './key-flows';

/**
 * Columns of `itap.client_application_keys` the `org_admin` role reads. The secret is not among
 * them: its fingerprint and its ciphertext are never selectable, so a key's secret is seen once,
 * in the answer of "Rotate key", and never again.
 */
export const clientKeyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  application_id: f.relation({
    to: CLIENT_APPLICATION_RESOURCE,
    required: true,
    write: 'never',
    providerOptions: { relationship: 'application' },
    texts: { label: 'Application', doc: { summary: 'The client application that signs its requests with the key.' } },
  }),
  key_prefix: f.text({
    write: 'never',
    texts: {
      label: 'Prefix',
      doc: {
        summary:
          'The public part of the key (8 letters and digits): requests name it in their Authorization header, so it identifies the key in logs and here. The secret is never shown again.',
      },
    },
  }),
  created_at: dateTime({ system: true, texts: { label: 'Created', doc: { summary: 'When the key was created by “Rotate key”.' } } }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who rotated the key in.' } },
  }),
  expires_at: dateTime({
    system: true,
    texts: {
      label: 'Expires',
      doc: { summary: 'From then on requests signed with the key are refused (key expired). Empty: the key does not expire.' },
    },
  }),
  last_used_at: dateTime({
    system: true,
    texts: { label: 'Last used', doc: { summary: 'The last time a request signed with the key was accepted. Empty: never used.' } },
  }),
  revoked_at: dateTime({
    system: true,
    texts: {
      label: 'Revoked',
      doc: { summary: 'When the key was revoked: from then on every request signed with it is refused, for good. Empty: not revoked.' },
    },
  }),
  revoked_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Revoked by', doc: { summary: 'The member who revoked the key.' } },
  }),
};

/** The columns the application's Keys tab lists. */
export const CLIENT_KEY_COLUMNS = ['key_prefix', 'created_at', 'expires_at', 'last_used_at', 'revoked_at'] as const;

/**
 * API keys of client applications (`itap.client_application_keys`), listed on the application's
 * Keys tab. A key is created only by the application's "Rotate key" flow (the
 * `rotate_client_key` action, at most two active keys) and changes only by "Revoke key"
 * (`revoke_client_key`, terminal); nothing else about a key is edited or deleted by hand.
 */
export const clientApplicationKey = defineResource(CLIENT_APPLICATION_KEY_RESOURCE, {
  texts: {
    label: 'API key',
    labelPlural: 'API keys',
    doc: {
      summary:
        'A key a client application signs its requests with: a public prefix and a secret shown only once, when the key is created. At most two are active at a time, so a new key can be rolled out before the old one is revoked.',
    },
  },
  basePath: '/client-application-keys',
  displayField: 'key_prefix',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: clientKeyFields,
  actions: (r) => ({ item: [r.action.flow('revoke_key', revokeKeyFlow)] }),
  views: {
    list: { page: false, columns: [...CLIENT_KEY_COLUMNS], defaultSort: [{ field: 'created_at', direction: 'desc' }] },
    show: { page: false },
  },
});
