import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { runSql } from './access-cleanup';
import { graphqlAs } from './access-support';
import { ADMIN_EMAIL, NOVA_FACILITY, NOVA_NAME, devStackEnabled, openSignedIn } from './dev-stack';
import { type FaceAuthRun, removeFaceAuthRun, seedPendingPartial } from './face-auth-support';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-fa-${Date.now()}`;
/** Three frames of a seeded employee (`apps/backend/seed-assets`, Pexels licence). */
const FACES = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/seed-assets/faces/person-03');
const frames = (...n: number[]): string[] => n.map((i) => resolve(FACES, `${i}.jpg`));

/*
 * One page for the whole flow, from the run's shared admin session (Nova). Two applications named
 * after the run (normal and sandbox) are created in the console; the normal one gets a facility,
 * the Employees segment and identification, two keys (a third is refused, one is revoked), a
 * tester run over three seeded frames, and a pending partial match replayed with the admin secret
 * that is approved in the console. Every toast of a confirm-only flow (Revoke key, Suspend,
 * Reactivate, Revoke) is checked in the real browser (G72). Cleanup with the admin secret.
 */
test.describe.serial('face authentication smoke', () => {
  let page: Page;
  let run: FaceAuthRun | undefined;
  let normal = '';
  let sandbox = '';

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    const [[organizationId = '', userId = ''] = []] = await runSql(
      `select o.id, (select id from auth.users where email = '${ADMIN_EMAIL}') from itap.organizations o where o.name = '${NOVA_NAME}'`,
    );
    run = { run: RUN, startedAt: new Date().toISOString(), organizationId, userId };
  });

  test.afterAll(async () => {
    try {
      if (run !== undefined) {
        const left = await removeFaceAuthRun(run, async (id) => {
          await graphqlAs(page, 'mutation ($f: uuid!) { delete_file(file_id: $f) { file_id } }', { f: id });
        });
        expect(left).toBe(0);
      }
    } finally {
      await page.context().close();
    }
  });

  const main = (): Locator => page.getByRole('main');
  const dialog = (): Locator => page.getByRole('dialog');
  const field = (name: string): Locator => page.getByTestId(`form-field-input:client_application:create:${name}`);
  const toast = (text: string | RegExp): Locator => page.locator('[data-sonner-toast]').filter({ hasText: text });

  /** Runs an item flow from the record's "More" menu. */
  async function fromMore(label: string): Promise<void> {
    await main().getByRole('button', { name: 'More', exact: true }).first().click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  }

  async function createApplication(name: string, isSandbox: boolean): Promise<string> {
    await page.goto('/client-applications/create');
    await field('name').fill(name);
    await field('platform').click();
    await page.getByRole('option', { name: /^Server\b/ }).click();
    if (isSandbox) await field('is_sandbox').click();
    await page.getByTestId('form-submit:client_application:create').click();
    await expect(page).toHaveURL(/\/client-applications\/[0-9a-f-]{36}$/);
    return page.url().split('/').pop() ?? '';
  }

  /** Picks an option of the dialog's first select, typing `search` first into a relation select's search box. */
  async function pickInDialog(search: string | null, option: RegExp): Promise<void> {
    await dialog().getByRole('combobox').first().click();
    if (search !== null) await page.getByRole('combobox').last().fill(search);
    await page.getByRole('option', { name: option }).first().click();
  }

  test('should refuse thresholds out of order, then create a normal and a sandbox application', async () => {
    await page.goto('/client-applications/create');
    await field('name').fill(`${RUN} refused`);
    await field('threshold_min').fill('0.9');
    await field('threshold').fill('0.6');
    await page.getByTestId('form-submit:client_application:create').click();
    await expect(main().getByText('The threshold must not be below the minimum threshold.').first()).toBeVisible();
    await expect(page).toHaveURL(/\/client-applications\/create$/);

    normal = await createApplication(`${RUN} kiosk`, false);
    sandbox = await createApplication(`${RUN} sandbox`, true);
    await page.getByRole('tab', { name: 'Population', exact: true }).click();
    await expect(main().getByText('Sandbox population: segments')).toBeVisible();
  });

  test('should bind a facility, a segment and identification to the normal application; a sandbox offers no facility', async () => {
    await page.goto(`/client-applications/${normal}`);
    for (const [flow, search, option, added] of [
      ['Add facility', NOVA_FACILITY, new RegExp(`^${NOVA_FACILITY}`), 'Facility added.'],
      ['Add segment', 'Employees', /^Employees/, 'Segment added.'],
      ['Allow mode', null, /^Identification/, 'Mode added.'],
    ] as const) {
      await fromMore(flow);
      await pickInDialog(search, option);
      await dialog().getByRole('button', { name: flow, exact: true }).click();
      await expect(toast(added)).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Population', exact: true }).click();
    await expect(main().getByText(NOVA_FACILITY).first()).toBeVisible();

    await page.goto(`/client-applications/${sandbox}`);
    await main().getByRole('button', { name: 'More', exact: true }).first().click();
    await expect(page.getByRole('menuitem', { name: 'Add segment', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Add facility', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Add access point', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('should show a rotated secret once, refuse a third key and revoke one from its row', async () => {
    await page.goto(`/client-applications/${normal}`);
    const rotate = async (): Promise<string> => {
      await fromMore('Rotate key');
      await dialog().getByRole('button', { name: 'Rotate key', exact: true }).click();
      const secret = dialog().getByTestId('client-key-secret');
      await expect(secret).toBeVisible();
      const prefix = await secret.locator('#client-key-prefix').inputValue();
      const value = await secret.locator('#client-key-secret').inputValue();
      expect(value.length).toBeGreaterThan(16);
      await page.keyboard.press('Escape');
      await expect(dialog()).toHaveCount(0);
      return `${prefix}|${value}`;
    };
    const [prefix, secret] = (await rotate()).split('|') as [string, string];
    await page.reload();
    await page.getByRole('tab', { name: 'Keys', exact: true }).click();
    await expect(main().getByText(prefix).first()).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
    expect(await page.content()).not.toContain(secret);

    await rotate();
    await fromMore('Rotate key');
    await dialog().getByRole('button', { name: 'Rotate key', exact: true }).click();
    await expect(dialog().getByText(/already has two active keys/)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Keys', exact: true }).click();
    const row = main().getByRole('row').filter({ hasText: prefix });
    await row.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Revoke key' }).click();
    await dialog().getByRole('button', { name: 'Revoke key', exact: true }).click();
    // G72 check: a confirm-only flow from a related list row menu.
    await expect(toast(`Key ${prefix} is revoked.`)).toBeVisible();
  });

  test('should refuse 2 frames and show the decision for 3 frames of a seeded employee', async () => {
    await page.goto('/authenticate-a-face');
    await main().getByRole('combobox', { name: /^Application/ }).click();
    await page.getByRole('combobox').last().fill(RUN);
    await page.getByRole('option', { name: new RegExp(`${RUN} kiosk`) }).click();
    const input = main().locator('input[type="file"]').first();
    await input.setInputFiles(frames(1, 2));
    await expect(main().getByRole('img', { name: 'Photo 2' })).toBeVisible();
    await main().getByRole('button', { name: 'Authenticate', exact: true }).click();
    await expect(main().getByText('Add at least 3 photos.').first()).toBeVisible();

    await input.setInputFiles(frames(3));
    await expect(main().getByRole('img', { name: 'Photo 3' })).toBeVisible();
    await main().getByRole('button', { name: 'Authenticate', exact: true }).click();
    const decision = main().getByTestId('auth-decision');
    await expect(decision).toBeVisible({ timeout: 30_000 });
    // person-03 is a seeded employee, in the bound Employees segment.
    await expect(decision).toHaveAttribute('data-outcome', 'success');
    await expect(decision.getByRole('link', { name: 'Open the session' })).toBeVisible();
  });

  test('should approve a pending partial match with a note and show the reviewer', async () => {
    if (run === undefined) throw new Error('no run');
    const pending = await seedPendingPartial(run, normal);
    await page.goto(`/authentication-attempts/${pending}`);
    await expect(main().getByText('Partial match').first()).toBeVisible();
    const approve = main().getByRole('button', { name: 'Approve', exact: true });
    if ((await approve.count()) > 0) await approve.first().click();
    else await fromMore('Approve');
    const note = `${RUN}: badge checked by the guard`;
    await dialog().getByRole('textbox').first().fill(note);
    await dialog().getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(toast(/Attempt approved/)).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await expect(main().getByText(note)).toBeVisible();
    await expect(main().getByText('Approved').first()).toBeVisible();
    const reviewer = await graphqlAs<{ authentication_attempts_by_pk: { reviewed_by: string | null } }>(
      page,
      'query ($id: uuid!) { authentication_attempts_by_pk(id: $id) { reviewed_by } }',
      { id: pending },
    );
    expect(reviewer.authentication_attempts_by_pk.reviewed_by).toBe(run.userId);
  });

  test('should toast Suspend, Reactivate and Revoke of an application (G72 check)', async () => {
    await page.goto(`/client-applications/${normal}`);
    const code = (await main().getByText(/^APP-\d+$/).first().textContent()) ?? '';
    for (const [flow, said] of [
      ['Suspend', `${code} is suspended.`],
      ['Reactivate', `${code} is active again.`],
      ['Revoke', `${code} is revoked`],
    ] as const) {
      await fromMore(flow);
      await dialog().getByRole('button', { name: flow, exact: true }).click();
      await expect(toast(said)).toBeVisible();
    }
  });
});
