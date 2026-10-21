import { type Page, expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  NOVA_FACILITY,
  NOVA_NAME,
  RIVERSIDE_FACILITY,
  RIVERSIDE_NAME,
  devStackEnabled,
  rememberOrganization,
  seedPassword,
} from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const organizationSwitcher = (page: Page, name: string) =>
  page.getByRole('button', { name: `Organization: ${name}` });

async function switchOrganization(page: Page, from: string, to: string): Promise<void> {
  await organizationSwitcher(page, from).click();
  await page.getByRole('menuitem', { name: to }).click();
  await expect(organizationSwitcher(page, to)).toBeVisible();
}

/*
 * One browser session for the whole flow: hasura-auth allows ten sign-ins per
 * five minutes, so the flow signs in once (plus one setup sign-in).
 */
test.describe.serial('sign-in, organization switching, sign-out', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Sign-in opens the last organization; make it Nova Tower whatever a previous run left.
    await rememberOrganization(NOVA_NAME);
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('should sign in to the dashboard of the last organization', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(seedPassword());
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(organizationSwitcher(page, NOVA_NAME)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should switch to Riverside and list its facilities', async () => {
    await switchOrganization(page, NOVA_NAME, RIVERSIDE_NAME);

    const picker = page.getByRole('combobox', { name: 'Facility' });
    await expect(picker).toHaveText('All facilities');
    await picker.click();
    await expect(page.getByRole('option', { name: RIVERSIDE_FACILITY })).toBeVisible();
    await expect(page.getByRole('option', { name: NOVA_FACILITY, exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: RIVERSIDE_FACILITY }).click();
    await expect(picker).toHaveText(RIVERSIDE_FACILITY);

    // Back to Nova Tower: its own facility choice (none yet) applies, not Riverside's.
    await switchOrganization(page, RIVERSIDE_NAME, NOVA_NAME);
    await expect(picker).toHaveText('All facilities');
  });

  test('should end on the sign-in page when the refresh token is rejected mid-session', async () => {
    const saved = await page.evaluate(() => localStorage.getItem('itap:auth:v1'));
    expect(saved).not.toBeNull();
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as {
        base: { refreshToken: string; expiresAt: number };
        org: { expiresAt: number };
      };
      stored.base.refreshToken = '00000000-0000-4000-8000-000000000000';
      stored.base.expiresAt = 0;
      stored.org.expiresAt = 0;
      localStorage.setItem('itap:auth:v1', JSON.stringify(stored));
    });

    // The next read renews the organization token, the refresh is refused, the session ends.
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('itap:auth:v1'))).toBeNull();

    // Put the real session back for the sign-out step (no second sign-in: auth rate limit).
    await page.evaluate((value) => localStorage.setItem('itap:auth:v1', value ?? ''), saved);
    await page.goto('/dashboard');
    await expect(organizationSwitcher(page, NOVA_NAME)).toBeVisible();
  });

  test('should sign out to the sign-in page', async () => {
    await page.getByTestId('user-menu:trigger').click();
    await page.getByTestId('user-menu:sign-out').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test('should land a stale stored session on the sign-in page without a loop', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    const past = Date.now() - 60 * 60_000;
    localStorage.setItem(
      'itap:auth:v1',
      JSON.stringify({
        base: {
          accessToken: 'expired',
          refreshToken: '00000000-0000-4000-8000-000000000000',
          expiresAt: past,
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@itap.demo', displayName: '' },
        },
        org: { accessToken: 'expired', expiresAt: past, organizationId: 'x', role: 'org_admin' },
      }),
    );
  });
  // Main-frame paths in order, repeats of the same path collapsed (one change can be reported twice).
  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const path = new URL(frame.url()).pathname;
    if (visited.at(-1) !== path) visited.push(path);
  });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(page).toHaveURL(/\/login$/);
  expect(visited).toEqual(['/dashboard', '/login']);
  expect(await page.evaluate(() => localStorage.getItem('itap:auth:v1'))).toBeNull();
});
