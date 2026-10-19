import { describe, expect, it } from 'vitest';
import { parseHasuraResponse } from '../../src/hasura/client.js';
import { testEnv } from './support/clients.js';
import { expectDenied } from './support/fixtures.js';

/** Unauthenticated request: no Authorization header, so Hasura uses HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public. */
function anonymous<T>(query: string): Promise<T> {
  return fetch(testEnv().HASURA_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then((res) => parseHasuraResponse<T>(res));
}

describe('public (unauthenticated) role', () => {
  it('should expose no query root fields and no mutations', async () => {
    const data = await anonymous<{
      __schema: { queryType: { fields: { name: string }[] }; mutationType: { name: string } | null };
    }>(`{ __schema { queryType { fields { name } } mutationType { name } } }`);
    // Hasura adds a placeholder field when a role has no queries at all.
    expect(data.__schema.queryType.fields.map((f) => f.name)).toEqual(['no_queries_available']);
    expect(data.__schema.mutationType).toBeNull();
  });

  it('should reject an unauthenticated organizations query as field-not-found', async () => {
    await expectDenied(anonymous(`{ organizations { id } }`), 'organizations');
    await expectDenied(anonymous(`{ files { id } }`), 'files');
  });
});
