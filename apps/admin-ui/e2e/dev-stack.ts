import { fileURLToPath } from 'node:url';
import { type Browser, type Page, expect } from '@playwright/test';
import { ADMIN_EMAIL, DEV_AUTH, DEV_GRAPHQL, seedPassword } from '../tests/support/dev-hosts';

/**
 * Direct calls to the dev stack, for test setup only: a known "last
 * organization" for the seeded admin. Hosts and seed constants are shared with
 * the vitest dev-stack tests (`../tests/support/dev-hosts.ts`).
 */
export {
  ADMIN_EMAIL,
  DEV_STACK_ENABLED as devStackEnabled,
  NOVA_FACILITY,
  NOVA_NAME,
  RIVERSIDE_FACILITY,
  RIVERSIDE_NAME,
  seedPassword,
} from '../tests/support/dev-hosts';

async function graphql(token: string, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(DEV_GRAPHQL, {
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
  const response = await fetch(`${DEV_AUTH}/signin/email-password`, {
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

/** The signed-in admin's browser state (Nova Tower), written once per run by `global-setup.ts`. */
export const ADMIN_STATE = fileURLToPath(new URL('./.auth/admin.json', import.meta.url));

/** A page of the shared admin session (Nova Tower), opened on the dashboard. */
export async function openSignedIn(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}
