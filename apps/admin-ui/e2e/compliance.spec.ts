import { type Locator, type Page, expect, test } from '@playwright/test';
import { runSql } from './access-cleanup';
import { graphqlAs, localInput, signInSecondAdmin } from './access-support';
import { type ComplianceRun, removeComplianceRun, retentionFootprint } from './compliance-support';
import { NOVA_NAME, devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-comp-${Date.now()}`;

/*
 * One page for the whole flow, from the run's shared admin session (Nova), and one page of the
 * second administrator (nova.admin@itap.demo) for the export's owner-only file:
 * - the retention plan (dry run) shows its counts and writes nothing (Review Focus 2);
 * - a legal hold created in the console offers no Starts input once started (Review Focus 3);
 * - an erasure of a THROWAWAY person created here is not filed without the typed code, and under
 *   the hold it completes partially (Review Focus 1); the hold is then ended (End now);
 * - an export's file opens for its owner only (Review Focus 4);
 * - the system status page renders its probes (Review Focus 5).
 * Erasure only ever touches the throwaway person. Cleanup with the admin secret.
 */
test.describe.serial('compliance smoke', () => {
  let page: Page;
  let other: Page | undefined;
  const run: ComplianceRun = { run: RUN, organizationId: '', throwaway: '', files: new Set() };
  let throwawayCode = '';
  let holdUrl = '';
  let jobUrl = '';

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    const [[organizationId = ''] = []] = await runSql(`select id from itap.organizations where name = '${NOVA_NAME}'`);
    run.organizationId = organizationId;
    const created = await graphqlAs<{ insert_profiles_one: { id: string; code: string } }>(
      page,
      'mutation ($o: profiles_insert_input!) { insert_profiles_one(object: $o) { id code } }',
      { o: { first_name: 'Erasure', last_name: `Throwaway ${RUN}`, profile_type: 'visitor', notes: 'compliance e2e: throwaway subject' } },
    );
    run.throwaway = created.insert_profiles_one.id;
    throwawayCode = created.insert_profiles_one.code;
  });

  test.afterAll(async () => {
    try {
      expect(await removeComplianceRun(run)).toBe(0);
    } finally {
      await other?.context().close();
      await page.context().close();
    }
  });

  const main = (): Locator => page.getByRole('main');
  const dialog = (): Locator => page.getByRole('dialog');
  const toast = (text: string | RegExp): Locator => page.locator('[data-sonner-toast]').filter({ hasText: text });

  async function fromMore(label: string): Promise<void> {
    await main().getByRole('button', { name: 'More', exact: true }).first().click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  }

  test('should count the retention plan per class and write nothing (dry run)', async () => {
    const before = await retentionFootprint(run.organizationId);
    const mutations: string[] = [];
    let reads = 0;
    const watch = (request: { method: () => string; url: () => string; postData: () => string | null }) => {
      if (request.method() !== 'POST' || !request.url().includes('/v1/graphql')) return;
      const body = JSON.parse(request.postData() ?? '{}') as { query?: string };
      if (/^\s*mutation\b/u.test(body.query ?? '')) mutations.push(body.query ?? '');
      else reads += 1;
    };
    page.on('request', watch);
    try {
      await page.goto('/retention-plan');
      await expect(main().getByTestId('retention-plan-summary')).toBeVisible();
      const counts = main().getByTestId('retention-plan-candidates');
      await expect(counts.first()).toBeVisible();
      for (const text of await counts.allTextContents()) expect(text.trim()).toMatch(/^[\d,]+$/u);
      expect(await counts.count()).toBeGreaterThan(5);

      await main().getByRole('combobox', { name: 'As of' }).click();
      await page.getByRole('option', { name: 'In 30 days' }).click();
      await main().getByRole('button', { name: 'Count again' }).click();
      await expect(main().getByTestId('retention-plan-summary')).toBeVisible();
      await expect(counts.first()).toBeVisible();
    } finally {
      page.off('request', watch);
    }
    expect(reads).toBeGreaterThan(0);
    expect(mutations).toEqual([]);
    expect(await retentionFootprint(run.organizationId)).toBe(before);
  });

  test('should create a legal hold whose start offers no input once started', async () => {
    const field = (mode: string, name: string) => page.getByTestId(`form-field-input:legal_hold:${mode}:${name}`);
    await page.goto('/legal-holds/create');
    await field('create', 'name').fill(`${RUN} erasure hold`);
    await field('create', 'reason').fill('compliance e2e: keeps the throwaway person');
    await field('create', 'starts_at').fill(localInput(-2));
    await page.getByTestId('form-submit:legal_hold:create').click();
    await expect(page).toHaveURL(/\/legal-holds\/[0-9a-f-]{36}$/);
    holdUrl = page.url();
    const holdId = holdUrl.split('/').pop() ?? '';
    await graphqlAs(page, 'mutation ($o: legal_hold_targets_insert_input!) { insert_legal_hold_targets_one(object: $o) { id } }', {
      o: { hold_id: holdId, profile_id: run.throwaway },
    });

    await page.goto(`${holdUrl}/edit`);
    await expect(field('edit', 'name')).toHaveValue(`${RUN} erasure hold`);
    await expect(main().getByText(/its start can no longer move/u).first()).toBeVisible();
    await expect(field('edit', 'starts_at')).toHaveCount(0);
    await expect(field('edit', 'ends_at')).toBeVisible();

    // The held person's page says so, with a link to the hold.
    await page.goto(`/profiles/${run.throwaway}`);
    const notice = main().getByTestId('legal-hold-notice');
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('link', { name: `${RUN} erasure hold` })).toBeVisible();
  });

  test('should not file an erasure without the typed code, and complete it partially under the hold', async () => {
    const filed = async (): Promise<number> =>
      (
        await graphqlAs<{ data_subject_requests: unknown[] }>(page, 'query ($p: uuid!) { data_subject_requests(where: { profile_id: { _eq: $p } }) { id } }', {
          p: run.throwaway,
        })
      ).data_subject_requests.length;

    await page.goto('/data-subject-requests');
    await main().getByRole('button', { name: 'Erasure request', exact: true }).click();
    await dialog().getByRole('combobox', { name: /^Person/u }).click();
    await page.getByRole('combobox').last().fill(`Throwaway ${RUN}`);
    await page.getByRole('option', { name: new RegExp(`Throwaway ${RUN}`, 'u') }).first().click();
    const review = dialog().getByTestId('dsr-erasure-review');
    await expect(review.getByTestId('dsr-erasure-subject')).toContainText(throwawayCode);
    await expect(review.getByTestId('dsr-erasure-person-held')).toContainText(`${RUN} erasure hold`);

    const confirmation = dialog().getByRole('textbox', { name: /Type the person’s code to confirm/u });
    await confirmation.fill('P-00000');
    await dialog().getByRole('button', { name: 'Erasure request', exact: true }).last().click();
    await expect(dialog().getByText(/The confirmation does not match/u).first()).toBeVisible();
    expect(await filed()).toBe(0);

    await confirmation.fill(throwawayCode);
    await dialog().getByRole('button', { name: 'Erasure request', exact: true }).last().click();
    // The review step, then the destructive confirmation.
    await expect(dialog().getByTestId('dsr-erasure-review').last()).toBeVisible();
    await page.getByRole('alertdialog').or(dialog()).getByRole('button', { name: /^(Erasure request|Confirm|Continue)$/u }).last().click();
    await expect(page).toHaveURL(/\/data-subject-requests\/[0-9a-f-]{36}$/u, { timeout: 30_000 });
    expect(await filed()).toBe(1);

    const partial = main().getByTestId('dsr-partial');
    await expect(partial).toBeVisible({ timeout: 120_000 });
    await expect(partial.getByRole('link', { name: `${RUN} erasure hold` })).toBeVisible();
    await expect(main().getByTestId('dsr-step:completed')).toContainText(/partial/iu);

    // The person is kept (restricted), not erased.
    const person = await graphqlAs<{ profiles_by_pk: { erased_at: string | null; processing_restricted: boolean } }>(
      page,
      'query ($p: uuid!) { profiles_by_pk(id: $p) { erased_at processing_restricted } }',
      { p: run.throwaway },
    );
    expect(person.profiles_by_pk).toEqual({ erased_at: null, processing_restricted: true });

    // The hold is ended from its page.
    await page.goto(holdUrl);
    await fromMore('End now');
    await page.getByRole('alertdialog').or(dialog()).getByRole('button', { name: 'End now', exact: true }).click();
    await expect(toast('The legal hold has ended.')).toBeVisible();
  });

  test('should open an export file for its owner only', async ({ browser }) => {
    const created = await graphqlAs<{ insert_export_definitions_one: { id: string } }>(
      page,
      'mutation ($o: export_definitions_insert_input!) { insert_export_definitions_one(object: $o) { id } }',
      {
        o: { name: `${RUN} profiles`, entity: 'profiles', format: 'csv', filters: { status: { _eq: 'active' } }, mode: 'full', max_rows: 5, timezone: 'UTC', is_active: true },
      },
    );
    await page.goto(`/export-definitions/${created.insert_export_definitions_one.id}`);
    await main().getByRole('button', { name: 'Run now', exact: true }).click();
    await expect(page).toHaveURL(/\/export-jobs\/[0-9a-f-]{36}$/u, { timeout: 30_000 });
    jobUrl = page.url();
    const open = main().getByRole('button', { name: 'Open file' });
    await expect(async () => {
      await page.reload();
      await expect(open.first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000 });

    other = await signInSecondAdmin(browser);
    await other.goto(jobUrl);
    const otherMain = other.getByRole('main');
    await expect(otherMain.getByText('Completed').first()).toBeVisible();
    await expect(otherMain.getByText('Only the member who ran the export can open its file').first()).toBeVisible();
    await expect(otherMain.getByRole('button', { name: 'Open file' })).toHaveCount(0);
  });

  test('should render the system status with every service', async () => {
    await page.goto('/system-status');
    const services = main().getByTestId('system-status:services');
    await expect(services).toBeVisible({ timeout: 30_000 });
    expect(await services.locator('[data-testid^="system-status:check:"]').count()).toBeGreaterThanOrEqual(5);
    await expect(main().getByTestId('system-status:crons')).toBeVisible();
    await expect(main().getByTestId('system-status:db-size')).toBeVisible();
    await main().getByRole('button', { name: 'Check again' }).click();
    await expect(services).toBeVisible();
  });
});
