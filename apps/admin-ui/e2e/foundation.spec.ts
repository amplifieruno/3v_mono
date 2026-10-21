import { type Page, expect, test } from '@playwright/test';
import { ADMIN_EMAIL, NOVA_NAME, devStackEnabled, rememberOrganization, seedPassword } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

/** A 1x1 PNG, enough for the logo upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const KPI_LABELS = [
  'Visitors today',
  'On site now',
  'Open incidents',
  'Critical incidents',
  'Devices offline',
  'Failed notifications, 24 h',
];

/*
 * One browser session for the whole smoke flow (hasura-auth allows ten
 * sign-ins per five minutes), steps in the order a first-day admin takes them.
 */
test.describe.serial('foundation smoke', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await rememberOrganization(NOVA_NAME);
    page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(seedPassword());
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('should show the dashboard figures as numbers', async () => {
    for (const label of KPI_LABELS) {
      const tile = page.getByText(label, { exact: true }).locator('xpath=..');
      await expect(tile).toContainText(label);
      // The value alone (tile text without its label) is a number, not a dash.
      await expect.poll(async () => (await tile.innerText()).replace(label, '').trim()).toMatch(/^\d+$/);
    }
  });

  test('should upload a logo, rename the organization and restore the name', async () => {
    const editedName = `${NOVA_NAME} (e2e)`;
    await page.goto('/organization-profile');
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/organization\/[0-9a-f-]+\/edit$/);

    await page.getByTestId('form-field-input:organization:edit:logo_file_id').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByTestId('storage-file-preview')).toBeVisible();
    await expect(page.getByTestId('storage-file-preview')).toHaveJSProperty('complete', true);
    await page.getByTestId('form-field-input:organization:edit:name').fill(editedName);
    await page.getByTestId('form-submit:organization:edit').click();
    await expect(page.getByText(editedName).first()).toBeVisible();

    await page.goto('/organization-profile');
    await expect(page.getByText(editedName).first()).toBeVisible();
    const logo = page.getByTestId('storage-file-preview');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // Restore the display name.
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('form-field-input:organization:edit:name').fill(NOVA_NAME);
    await page.getByTestId('form-submit:organization:edit').click();
    await page.goto('/organization-profile');
    await expect(page.getByText(NOVA_NAME).first()).toBeVisible();
    await expect(page.getByText(editedName)).toHaveCount(0);
  });

  test('should invite a member, show the one-time token and list the pending invitation', async () => {
    const email = `e2e-${Date.now()}@itap.test`;
    await page.goto('/invitations');
    await page.getByTestId('list-flow:organization_invitation:invite').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Administrator' }).click();
    await dialog.getByRole('button', { name: 'Invite member' }).last().click();

    const token = page.getByTestId('invitation-token');
    await expect(token).toBeVisible();
    await expect(token.getByRole('textbox')).toHaveValue(/\S{16,}/);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('row', { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toContainText('Pending');
  });

  test('should open Help and a field popover on the organization form', async () => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: 'Help' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Organization token' })).toBeVisible();

    await page.goto('/organization-profile');
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('form-field:organization:edit:legal_name:info').click();
    await expect(page.getByRole('dialog')).toContainText(
      'Registered company name for reports and exports, when it differs from the name.',
    );
  });

  test('should find Members in the command palette', async () => {
    await page.goto('/dashboard');
    await page.getByTestId('open-palette').click();
    await page.getByRole('combobox').fill('Members');
    await expect(page.getByRole('option', { name: /Members/ }).first()).toBeVisible();
  });
});
