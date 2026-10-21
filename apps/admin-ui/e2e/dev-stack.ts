/**
 * Direct calls to the dev stack, for test setup only: the seed's organization
 * ids and a known "last organization" for the seeded admin.
 */
const AUTH = 'http://127.0.0.1:4100/v1';
const GRAPHQL = 'http://127.0.0.1:8080/v1/graphql';

export const ADMIN_EMAIL = 'admin@itap.demo';
export const NOVA_NAME = 'Nova Tower Business Center';
export const RIVERSIDE_NAME = 'Riverside Office Park';
export const NOVA_FACILITY = 'Nova Tower';
export const RIVERSIDE_FACILITY = 'Riverside Building A';

export const devStackEnabled = process.env.ITAP_DEV_STACK === '1';

export function seedPassword(): string {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is not set (see apps/backend/.env).');
  return password;
}

async function graphql(token: string, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-hasura-role': 'user' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`GraphQL failed: ${JSON.stringify(body.errors)}`);
  return body.data;
}

/** Makes the named organization the admin's last one, so sign-in opens it. */
export async function rememberOrganization(name: string): Promise<void> {
  const response = await fetch(`${AUTH}/signin/email-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: seedPassword() }),
  });
  if (!response.ok) throw new Error(`Sign-in for test setup failed: HTTP ${response.status}`);
  const { session } = (await response.json()) as { session: { accessToken: string } };
  const data = await graphql(session.accessToken, '{ organization_members { organization_id organization { name } } }');
  const rows = data.organization_members as { organization_id: string; organization: { name: string } }[];
  const target = rows.find((row) => row.organization.name === name);
  if (!target) throw new Error(`${ADMIN_EMAIL} is not a member of ${name}`);
  await graphql(
    session.accessToken,
    'mutation ($id: uuid!) { switch_organization(organization_id: $id) { organization_id } }',
    { id: target.organization_id },
  );
}
