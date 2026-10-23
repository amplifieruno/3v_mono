import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { CLIENT_APPLICATION_KEY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { FACE_AUTH_BINDING } from './application-ops';

const NO_KEY = ' No key was created.';
const NOTHING = ' Nothing was changed.';

/**
 * What `rotate_client_key` answers before it stores anything (the backend's codes, and the
 * refusals of `itap.store_client_key` it passes on as is).
 */
export const ROTATE_REFUSALS: Readonly<Record<string, string>> = {
  client_key_limit:
    'The application already has two active keys, the most it may have (one in use and one rolling out). Revoke the key it no longer uses, then rotate again.' +
    NO_KEY,
  client_application_revoked: 'The application is revoked: it refuses every request for good and gets no new keys.' + NO_KEY,
  client_application_not_found: 'The application no longer exists (or is not visible to you).' + NO_KEY,
  client_key_expiry_invalid: 'The expiry must be in the future: choose a later time, or none for a key that does not expire.' + NO_KEY,
  client_key_prefix_conflict: 'No unique key prefix could be allocated this time: rotate again.' + NO_KEY,
  forbidden: 'Only an organization administrator can rotate keys.' + NO_KEY,
  auth_service_not_configured:
    'The face authentication service has no encryption key configured (AUTH_KEY_ENCRYPTION_KEY), so no key can be issued: ask the platform operator.' +
    NO_KEY,
  invalid_input: 'The request was not valid:',
};

/** The refusal reader of `rotate_client_key` (form-level issues). */
export const rotateRefusals: ActionRefusalReader = ({ code, message }) => {
  const text = ROTATE_REFUSALS[code];
  if (text === undefined) return null;
  return [{ code, message: code === 'invalid_input' ? `${text} ${message}.${NO_KEY}` : text, path: [] }];
};

export const rotateKeyInput = z.object({ applicationId: z.string().uuid(), expiresAt: z.string().nullable() });

/** What `rotate_client_key` answers (`ClientKeySecret`): the secret, in plain text, this once. */
export const rotateKeyOutput = z.object({
  key_id: z.string(),
  application_id: z.string(),
  prefix: z.string(),
  secret: z.string(),
  expires_at: z.string().nullable(),
});

/** An instant as the action takes it (ISO), or `null` for none. */
function instantOrNull(value: string | null): string | null {
  if (value === null || value.trim() === '') return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toISOString();
}

export const rotateKeyOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'rotateClientKey',
  {
    kind: 'mutation',
    document: `mutation RotateClientKey($application: uuid!, $expires: timestamptz) {
  rotate_client_key(application_id: $application, expires_at: $expires) { key_id application_id prefix secret expires_at }
}`,
    variables: (input) => {
      const { applicationId, expiresAt } = input as z.infer<typeof rotateKeyInput>;
      return { application: applicationId, expires: instantOrNull(expiresAt) };
    },
    mapResult: (data) => rootOf(data, 'rotate_client_key'),
  },
  rotateRefusals,
);

/**
 * The Hasura action `rotate_client_key(application_id, expires_at?)`: a new key whose secret is
 * answered once, in plain text, and never again (the database keeps a fingerprint and a
 * ciphertext no role may read). The flow hands the answer to the secret block and keeps it
 * nowhere else. Not replayed: a second send would create a second key.
 */
export const rotateClientKey = defineMutation('itap:rotate-client-key', {
  binding: rotateKeyOperation.binding,
  input: schema(rotateKeyInput),
  output: schema(rotateKeyOutput),
  effects: [{ resource: CLIENT_APPLICATION_KEY_RESOURCE }],
});

/** What `revoke_client_key` raises. */
export const REVOKE_KEY_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  client_key_not_found: 'The key no longer exists (or is not visible to you).' + NOTHING,
  client_key_revoked: 'The key is already revoked, and revoked is for good.' + NOTHING,
  member_required: 'Only an active member of the organization can revoke keys (your membership is suspended or expired).' + NOTHING,
};

export const revokeKeyInput = z.object({ keyId: z.string().uuid() });

const revokedRow = z.object({ id: z.string(), key_prefix: z.string(), revoked_at: z.string().nullable() });

export const revokeKeyOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'revokeClientKey',
  {
    kind: 'mutation',
    document: `mutation RevokeClientKey($key: uuid!) {
  revoke_client_key(args: { p_key: $key }) { id key_prefix revoked_at }
}`,
    variables: (input) => ({ key: (input as z.infer<typeof revokeKeyInput>).keyId }),
    mapResult: (data) => {
      const rows = rootOf(data, 'revoke_client_key');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(REVOKE_KEY_REFUSALS),
);

/** The tracked function `revoke_client_key` (org_admin): retires a key for good, at once. */
export const revokeClientKey = defineMutation('itap:revoke-client-key', {
  binding: revokeKeyOperation.binding,
  input: schema(revokeKeyInput),
  output: schema(revokedRow.nullable()),
  effects: [{ resource: CLIENT_APPLICATION_KEY_RESOURCE }],
});
