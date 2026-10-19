import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { parseHasuraJwtSecret, signBaseToken, signOrgToken } from './hasuraJwt.js';

const U = '11111111-1111-4111-8111-111111111111';
const CLAIMS = 'https://hasura.io/jwt/claims';
const secret = parseHasuraJwtSecret(
  JSON.stringify({ type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' }),
);

describe('hasuraJwt', () => {
  it('signs a token Hasura accepts', () => {
    const { token, expiresAt } = signOrgToken(
      { userId: U, organizationId: 'A1B2C3D4-0000-4000-8000-000000000001', role: 'org_admin', ttlSeconds: 900 },
      secret,
    );
    const decoded = jwt.verify(token, secret.key, { issuer: 'hasura-auth' }) as jwt.JwtPayload;
    const claims = decoded[CLAIMS] as Record<string, unknown>;
    expect(claims['x-hasura-organization-id']).toBe('a1b2c3d4-0000-4000-8000-000000000001');
    expect(claims['x-hasura-default-role']).toBe('org_admin');
    // Only org_admin: an org token cannot act as `user` (and so cannot renew itself via switch_organization).
    expect(claims['x-hasura-allowed-roles']).toEqual(['org_admin']);
    expect(claims['x-hasura-user-id']).toBe(U);
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(900);
    expect(expiresAt.getTime()).toBe((decoded.exp as number) * 1000);
  });

  it('signs a base token with default role user', () => {
    const { token } = signBaseToken({ userId: U, ttlSeconds: 60 }, secret);
    const decoded = jwt.verify(token, secret.key) as jwt.JwtPayload;
    const claims = decoded[CLAIMS] as Record<string, unknown>;
    expect(claims['x-hasura-default-role']).toBe('user');
    expect(claims['x-hasura-allowed-roles']).toEqual(['user', 'me']);
    expect(claims['x-hasura-user-id']).toBe(U);
  });

  it('rejects a non-HS256 secret', () => {
    expect(() => parseHasuraJwtSecret('{"type":"RS256","key":"x"}')).toThrow();
  });
});
