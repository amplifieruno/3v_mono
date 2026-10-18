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
      'x-hasura-allowed-roles': [input.role, 'user'],
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
