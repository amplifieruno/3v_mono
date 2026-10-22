import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type FullConfig, chromium, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_STATE, NOVA_NAME, devStackEnabled, rememberOrganization, seedPassword } from './dev-stack';

/** A shared state whose base token has less than this left is replaced (no spec should refresh it). */
const MIN_LEFT_MS = 10 * 60_000;

/** The base token expiry in the saved state, or 0 when there is none. */
function savedExpiry(): number {
  if (!existsSync(ADMIN_STATE)) return 0;
  try {
    const state = JSON.parse(readFileSync(ADMIN_STATE, 'utf8')) as {
      origins?: { localStorage?: { name: string; value: string }[] }[];
    };
    const entry = state.origins?.flatMap((o) => o.localStorage ?? []).find((e) => e.name === 'itap:auth:v1');
    const stored = JSON.parse(entry?.value ?? '{}') as { base?: { expiresAt?: number } };
    return stored.base?.expiresAt ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Signs the seeded admin in once for the whole run (hasura-auth allows ten sign-ins per five
 * minutes) and saves the browser state the specs open with (`openSignedIn`). A state saved by a
 * recent run is reused while its token is fresh. `auth.spec.ts` signs in itself: it tests sign-in.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  if (!devStackEnabled || savedExpiry() - Date.now() > MIN_LEFT_MS) return;
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:5173';
  await rememberOrganization(NOVA_NAME);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto('/');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(seedPassword());
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    mkdirSync(dirname(ADMIN_STATE), { recursive: true });
    await page.context().storageState({ path: ADMIN_STATE });
  } finally {
    await browser.close();
  }
}
