import jwt from 'jsonwebtoken';
import { z } from 'zod';

const secretSchema = z.object({
  type: z.literal('HS256'),
  key: z.string().min(1),
  issuer: z.string().min(1).optional(),
});

export type HasuraJwtSecret = { type: 'HS256'; key: string; issuer?: string };

export type SignedToken = { token: string; expiresAt: Date };

const CLAIMS_NAMESPACE = 'https://hasura.io/jwt/claims';

export function parseHasuraJwtSecret(json: string): HasuraJwtSecret {
  const { key, issuer } = secretSchema.parse(JSON.parse(json));
  return issuer ? { type: 'HS256', key, issuer } : { type: 'HS256', key };
}

function sign(
  claims: Record<string, unknown>,
  ttlSeconds: number,
  secret: HasuraJwtSecret,
): SignedToken {
  const token = jwt.sign({ [CLAIMS_NAMESPACE]: claims }, secret.key, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    ...(secret.issuer ? { issuer: secret.issuer } : {}),
  });
  const { exp } = jwt.decode(token) as jwt.JwtPayload;
  return { token, expiresAt: new Date((exp as number) * 1000) };
}

export function signOrgToken(
  input: { userId: string; organizationId: string; role: 'org_admin'; ttlSeconds: number },
  secret: HasuraJwtSecret,
): SignedToken {
  return sign(
    {
      // Only the org role: an org token cannot act as `user`, so it cannot call switch_organization to renew
      // itself; renewal always goes through the base token (§4.3), which Nhost stops issuing on sign-out/disable.
      'x-hasura-allowed-roles': [input.role],
      'x-hasura-default-role': input.role,
      'x-hasura-user-id': input.userId,
      'x-hasura-organization-id': input.organizationId.toLowerCase(),
    },
    input.ttlSeconds,
    secret,
  );
}

export function signBaseToken(
  input: { userId: string; ttlSeconds: number },
  secret: HasuraJwtSecret,
): SignedToken {
  return sign(
    {
      'x-hasura-allowed-roles': ['user', 'me'],
      'x-hasura-default-role': 'user',
      'x-hasura-user-id': input.userId,
    },
    input.ttlSeconds,
    secret,
  );
}

/**
 * Verifies an organization token (HS256 with the Hasura secret and issuer, unexpired with an `exp`, allowed role
 * org_admin, an organization claim) and returns its user, organization and expiry; null for anything else.
 */
export function verifyOrgToken(
  token: string,
  secret: HasuraJwtSecret,
): { userId: string; organizationId: string; expiresAt: Date } | null {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret.key, { algorithms: ['HS256'], ...(secret.issuer ? { issuer: secret.issuer } : {}) });
  } catch {
    return null;
  }
  if (typeof decoded === 'string') return null;
  const claims: unknown = decoded[CLAIMS_NAMESPACE];
  if (typeof claims !== 'object' || claims === null) return null;
  const record = claims as Record<string, unknown>;
  const roles = record['x-hasura-allowed-roles'];
  const organizationId = record['x-hasura-organization-id'];
  const userId = record['x-hasura-user-id'];
  if (!Array.isArray(roles) || !roles.includes('org_admin')) return null;
  if (typeof organizationId !== 'string' || organizationId === '' || typeof userId !== 'string') return null;
  if (typeof decoded.exp !== 'number') return null;
  return { userId, organizationId: organizationId.toLowerCase(), expiresAt: new Date(decoded.exp * 1000) };
}
