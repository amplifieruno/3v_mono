import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { encryptSecret, generateClientKey, hashSecret, type ServerKeys } from './crypto.js';

const STORE_KEY = `
  mutation RotateClientKey($args: store_client_key_args!) {
    store_client_key(args: $args) { id application_id key_prefix expires_at }
  }
`;

export type IssuedKey = { key_id: string; application_id: string; prefix: string; secret: string; expires_at: string | null };

/** A store_client_key refusal (SQL code such as client_key_limit), surfaced to the caller as is. */
export class ClientKeyError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code.replace(/_/g, ' '));
    this.name = 'ClientKeyError';
    this.code = code;
  }
}

function sqlCode(error: unknown): string | undefined {
  if (!(error instanceof HasuraError)) return undefined;
  return /\b(client_[a-z_]+|auth_[a-z_]+|access_point_not_bound)\b/.exec(`${error.detail ?? ''} ${error.message}`)?.[1];
}

/**
 * The rotate path of a client key (action rotate_client_key, and the seed): prefix and secret generated here, stored
 * through itap.store_client_key with the caller session of `actor` as scrypt fingerprint + AES-256-GCM ciphertext
 * (AAD = prefix); the plaintext secret is returned exactly once. A prefix collision is retried (3x).
 */
export async function issueClientKey(
  actor: HasuraClient,
  keys: ServerKeys,
  applicationId: string,
  expiresAt: string | null,
): Promise<IssuedKey> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { prefix, secret } = generateClientKey();
    try {
      const data = await actor.request<{
        store_client_key: { id: string; application_id: string; key_prefix: string; expires_at: string | null }[];
      }>(STORE_KEY, {
        args: {
          p_application: applicationId,
          p_key_prefix: prefix,
          p_secret_hash: hashSecret(secret),
          p_secret: encryptSecret(keys, secret, prefix),
          p_expires_at: expiresAt,
        },
      });
      const row = data.store_client_key[0];
      return { key_id: row.id, application_id: row.application_id, prefix: row.key_prefix, secret, expires_at: row.expires_at };
    } catch (error: unknown) {
      const text = error instanceof HasuraError ? `${error.detail ?? ''} ${error.message}` : '';
      if (text.includes('client_application_keys_key_prefix_key')) continue;
      const code = sqlCode(error);
      if (code) throw new ClientKeyError(code);
      throw error;
    }
  }
  throw new ClientKeyError('client_key_prefix_conflict');
}
