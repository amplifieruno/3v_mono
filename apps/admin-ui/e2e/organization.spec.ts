import { type Page, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
const COMPANY = `${RUN} Company`;
const COMPANY_RENAMED = `${RUN} Company renamed`;
const SCHEDULE = `${RUN} Night shift`;
const ATTRIBUTE_KEY = `e2e_${Date.now()}`;
const ATTRIBUTE_LABEL = `${RUN} Shift`;

/** Rows this run may have created, by table and the column that carries the run marker. */
const SWEEP: Record<string, string> = {
  companies: 'name',
  work_schedules: 'name',
  custom_attribute_definitions: 'key',
};

/*
 * One browser page for the whole flow, opened from the run's shared admin session
 * (`global-setup.ts`; hasura-auth allows ten sign-ins per five minutes). Every row the run creates is deleted through the UI; the
 * afterAll sweep removes what a failed step left behind.
 */
test.describe.serial('organization smoke', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
  });

  test.afterAll(async () => {
    try {
      await page.evaluate(
        async ({ sweep, run, key }) => {
          const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as { org?: { accessToken: string } };
          const token = stored.org?.accessToken;
          if (!token) return;
          for (const [table, column] of Object.entries(sweep)) {
            const marker = column === 'key' ? key : run;
            await fetch('/v1/graphql', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({
                query: `mutation ($m: String!) { delete_${table}(where: {${column}: {_like: $m}}) { affected_rows } }`,
                // `_` and `%` are LIKE wildcards: the marker matches literally, then any suffix.
                variables: { m: `${marker.replace(/[\\%_]/gu, '\\$&')}%` },
              }),
            });
          }
        },
        { sweep: SWEEP, run: RUN, key: ATTRIBUTE_KEY },
      );
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation with the stored organization token (setup and restore steps). */
  async function graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    return page.evaluate(
      async ({ q, v }) => {
        const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as { org?: { accessToken: string } };
        const response = await fetch('/v1/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.org?.accessToken ?? ''}` },
          body: JSON.stringify({ query: q, variables: v }),
        });
        const body = (await response.json()) as { data?: unknown; errors?: unknown };
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        return body.data;
      },
      { q: query, v: variables },
    );
  }

  /** Deletes the single list row matching the name through its row menu. */
  async function deleteRow(resource: string, name: string): Promise<void> {
    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByTestId(new RegExp(`^list-row-actions-menu:${resource}:`)).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  }

  test('should edit an organization setting and restore it', async () => {
    const field = 'form-field-input:organization_settings:edit:tracking_timeout_seconds';
    await page.goto('/organization-settings');
    await expect(page.getByText('Tracking timeout').first()).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    const input = page.getByTestId(field);
    await expect(input).toHaveValue(/^\d+$/);
    const original = await input.inputValue();
    const changed = String(Number(original) + 60);

    try {
      await input.fill(changed);
      await page.getByTestId('form-submit:organization_settings:edit').click();
      await expect(page).not.toHaveURL(/\/edit$/);

      await page.goto('/organization-settings');
      await page.getByRole('link', { name: 'Edit' }).click();
      await expect(page.getByTestId(field)).toHaveValue(changed);

      // A value outside the allowed range is refused on the form.
      await page.getByTestId(field).fill('5');
      await page.getByTestId('form-submit:organization_settings:edit').click();
      await expect(page.getByText('Enter a whole number from 30 to 86400.')).toBeVisible();

      await page.getByTestId(field).fill(original);
      await page.getByTestId('form-submit:organization_settings:edit').click();
      await expect(page).not.toHaveURL(/\/edit$/);
    } finally {
      // Whatever failed above, the organization keeps its original timeout.
      await graphql(
        'mutation ($v: Int!) { update_organization_settings(where: {}, _set: {tracking_timeout_seconds: $v}) { affected_rows } }',
        { v: Number(original) },
      );
    }
    await page.goto('/organization-settings');
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByTestId(field)).toHaveValue(original);
  });

  test('should create, edit and delete a company', async () => {
    await page.goto('/companies/create');
    await page.getByTestId('form-field-input:company:create:name').fill(COMPANY);
    await page.getByTestId('form-field-input:company:create:suite').fill('4B');
    await page.getByTestId('form-field-input:company:create:contact_email').fill('desk@e2e.itap.test');
    await page.getByTestId('form-submit:company:create').click();
    await expect(page).not.toHaveURL(/\/create$/);
    await expect(page.getByText(COMPANY).first()).toBeVisible();
    await expect(page.getByText('4B').first()).toBeVisible();
    await expect(page.getByText('desk@e2e.itap.test').first()).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByTestId('form-field-input:company:edit:name')).toHaveValue(COMPANY);
    await page.getByTestId('form-field-input:company:edit:name').fill(COMPANY_RENAMED);
    await page.getByTestId('form-field-input:company:edit:suite').fill('9Z');
    await page.getByTestId('form-submit:company:edit').click();
    await expect(page.getByText(COMPANY_RENAMED).first()).toBeVisible();

    await page.goto('/companies');
    const row = page.getByRole('row', { name: new RegExp(COMPANY_RENAMED) });
    await expect(row).toContainText('9Z');
    await expect(row).toContainText('desk@e2e.itap.test');
    await deleteRow('company', COMPANY_RENAMED);
  });

  test('should create a work schedule with an overnight window and show its summary', async () => {
    await page.goto('/work-schedules/create');
    await page.getByTestId('form-field-input:work_schedule:create:name').fill(SCHEDULE);

    await page.getByRole('button', { name: 'Add window' }).click();
    await page.getByRole('textbox', { name: 'From (Window 1)' }).fill('22:00');
    await page.getByRole('textbox', { name: 'To (Window 1)' }).fill('06:00');
    await expect(page.getByTestId('create-windows-0-row').getByText('Ends the next day')).toBeVisible();
    await page.getByTestId('form-submit:work_schedule:create').click();
    await expect(page).not.toHaveURL(/\/create$/);
    await expect(page.getByText('Mon–Fri 22:00–06:00 (overnight)').first()).toBeVisible();

    await page.goto('/work-schedules');
    const row = page.getByRole('row', { name: new RegExp(SCHEDULE) });
    await expect(row).toContainText('Mon–Fri 22:00–06:00 (overnight)');
    await expect(row).toContainText('UTC');
    await deleteRow('work_schedule', SCHEDULE);
  });

  test('should create a select attribute with options, then delete it', async () => {
    await page.goto('/custom-attributes/create');
    await page.getByTestId('form-field-input:custom_attribute_definition:create:key').fill(ATTRIBUTE_KEY);
    await page.getByTestId('form-field-input:custom_attribute_definition:create:label').fill(ATTRIBUTE_LABEL);
    await page.getByTestId('form-field-input:custom_attribute_definition:create:data_type').click();
    await page.getByRole('option', { name: 'Select' }).click();

    await page.getByRole('button', { name: 'Add option' }).click();
    await page.getByRole('textbox', { name: 'Option 1' }).fill('day');
    await page.getByRole('button', { name: 'Add option' }).click();
    await page.getByRole('textbox', { name: 'Option 2' }).fill('night');
    await page.getByTestId('form-submit:custom_attribute_definition:create').click();
    await expect(page).not.toHaveURL(/\/create$/);
    await expect(page.getByText(ATTRIBUTE_LABEL).first()).toBeVisible();
    await expect(page.getByText('day', { exact: true })).toBeVisible();
    await expect(page.getByText('night', { exact: true })).toBeVisible();

    await page.goto('/custom-attributes');
    await expect(page.getByRole('row', { name: new RegExp(ATTRIBUTE_LABEL) })).toContainText(ATTRIBUTE_KEY);
    await deleteRow('custom_attribute_definition', ATTRIBUTE_LABEL);
  });

  test('should save my preferences and restore them', async () => {
    const locale = 'form-field-input:user_settings:edit:locale';
    const zone = 'form-field-input:user_settings:edit:timezone';
    await page.goto('/preferences');
    await expect(page.getByTestId(zone)).toBeVisible();
    // The row may hold nothing yet (null language, no zone, or `UTC`): read exactly what is stored.
    const stored = (await graphql('query { user_settings { locale timezone } }', {})) as {
      user_settings: { locale: string | null; timezone: string | null }[];
    };
    const originalLocale = await page.getByTestId(locale).inputValue();
    const originalZone = stored.user_settings[0]?.timezone ?? null;
    const storedLocale = stored.user_settings[0]?.locale ?? null;

    try {
      await page.getByTestId(locale).fill('de-AT');
      await page.getByTestId(zone).click();
      await page.getByPlaceholder(/search/i).fill('Tokyo');
      await page.getByRole('option', { name: /Asia\/Tokyo/ }).click();
      await page.getByTestId('form-submit:user_settings:edit').click();

      await page.reload();
      await expect(page.getByTestId(locale)).toHaveValue('de-AT');
      await expect(page.getByTestId(zone)).toContainText('Asia/Tokyo');
      await expect(page.getByTestId(zone)).toContainText('+09:00');

      // The zone is optional: Clear empties it.
      await page.getByRole('button', { name: 'Clear time zone' }).click();
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes('/v1/graphql') &&
          (response.request().postData() ?? '').includes('user_settings') &&
          (response.request().postData() ?? '').includes('mutation'),
      );
      await page.getByTestId('form-submit:user_settings:edit').click();
      await saved;
      await page.reload();
      await expect(page.getByTestId(zone)).toContainText('Select');
    } finally {
      await page.goto('/preferences');
      await expect(page.getByTestId(zone)).toBeVisible();
      await graphql(
        'mutation ($l: String, $z: String) { update_user_settings(where: {}, _set: {locale: $l, timezone: $z}) { affected_rows } }',
        { l: storedLocale, z: originalZone },
      );
    }

    await page.reload();
    await expect(page.getByTestId(locale)).toHaveValue(originalLocale);
    await expect(page.getByTestId(zone)).toContainText(originalZone ?? 'Select');
    const restored = (await graphql('query { user_settings { timezone } }', {})) as {
      user_settings: { timezone: string | null }[];
    };
    expect(restored.user_settings[0]?.timezone ?? null).toBe(originalZone);
  });
});
