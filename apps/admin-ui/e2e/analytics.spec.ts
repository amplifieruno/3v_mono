import { type Page, expect, test } from '@playwright/test';
import { NOVA_FACILITY, devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;

/** The seeded dashboard shared with the organization (Nova Tower) and its five widgets. */
const SEEDED_DASHBOARD = 'Security overview';
const SEEDED_TILES = 5;
/** The seeded report whose upload failed, and a seeded completed one. */
const FAILED_REPORT = 'REPORT-00010';
const FAILED_ERROR = 'File upload failed: storage service unavailable (HTTP 503)';
const COMPLETED_REPORT = 'Weekly occupancy 2026-10-12 - 2026-10-18';

/** What a block or a tile shows when it could not read or draw: none may show on a seeded dashboard. */
const BROKEN = /could not be read|failed while drawing|cannot be shown|You may not read|Choose a facility/;

type Row = Record<string, unknown>;

/*
 * One browser page for the whole flow, opened from the run's shared admin session (Nova Tower).
 * Everything here reads seed data, except the run's own dashboard, which the console deletes (the
 * afterAll sweep repeats that for a failed step); the refused report is never sent.
 */
test.describe.serial('analytics smoke', () => {
  let page: Page;
  let opened = false;
  const DASHBOARD = `${RUN} dashboard`;

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
  });

  test.afterAll(async () => {
    if (!opened) return;
    try {
      await graphql('mutation ($n: String!) { delete_dashboards(where: {name: {_eq: $n}}) { affected_rows } }', { n: DASHBOARD });
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : String(error);
      console.warn(`analytics smoke cleanup failed: ${description}`);
      test.info().annotations.push({ type: 'cleanup-failed', description });
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation as the signed-in admin (the stored organization token). */
  async function graphql<T = Row>(query: string, variables: Row = {}): Promise<T> {
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
        return body.data as T;
      },
      { q: query, v: variables },
    );
  }

  const dashboards = async (): Promise<number> =>
    (await graphql<{ dashboards: unknown[] }>('query ($n: String!) { dashboards(where: {name: {_eq: $n}}) { id } }', { n: DASHBOARD })).dashboards.length;

  /** A rendered block: its `section` (a block that cannot draw shows a one-line note under the same test id). */
  const drawn = (testId: string) => page.locator(`section[data-testid="${testId}"]`);

  test('should draw the charts of Nova Tower on the Analytics page and switch the period', async () => {
    await page.goto('/analytics');
    await page.getByTestId('context-picker:facility').click();
    await page.getByRole('option', { name: NOVA_FACILITY, exact: true }).click();

    await expect(drawn('kpis')).toBeVisible();
    // The last 7 days (the default tab) read hours; the last 30 days read days.
    await expect(drawn('occupancy-series')).toHaveAttribute('data-bucket', 'hour');
    await expect(drawn('heatmap').getByRole('img')).toBeVisible();
    await expect(drawn('flow-matrix').getByRole('img')).toBeVisible();

    await page.getByRole('tab', { name: 'Last 30 days' }).click();
    await expect(drawn('occupancy-series')).toHaveAttribute('data-bucket', 'day');
    await expect(drawn('heatmap')).toBeVisible();
    await expect(drawn('flow-matrix')).toBeVisible();
    await expect(page.getByText(BROKEN)).toHaveCount(0);
  });

  test('should draw every tile of the seeded shared dashboard', async () => {
    await page.goto('/dashboards');
    await page.getByRole('link', { name: SEEDED_DASHBOARD }).first().click();
    await expect(page).toHaveURL(/\/dashboards\/[0-9a-f-]{36}$/);
    const grid = page.getByTestId('dashboard-grid');
    await expect(grid.getByTestId('dashboard-tile')).toHaveCount(SEEDED_TILES);
    // Every tile done reading, none refused, failed or waiting for a facility.
    await expect(grid).not.toContainText(/Reading/);
    await expect(grid.getByTestId(/^dashboard-tile:/)).toHaveCount(0);
    await expect(grid.getByText(BROKEN)).toHaveCount(0);
    await expect(grid.locator('section[data-testid="kpis"]')).toBeVisible();
  });

  test('should refuse an invalid widget with its reason, then save a dashboard with one widget, show it and delete it', async () => {
    await page.goto('/dashboards/create');
    await page.getByTestId('form-field-input:dashboard:create:name').fill(DASHBOARD);
    await page.getByRole('button', { name: 'Add widget' }).click();
    const row = page.getByTestId('dashboard-widget-row');
    await expect(row).toHaveCount(1);
    await row.getByLabel('Title').fill('E2E key figures');

    // A full-width widget moved to column 8 does not fit the 12 columns: refused before anything is sent.
    await row.getByLabel('Column (0–11)').fill('8');
    const reason = 'Widget 1 “E2E key figures”: x + w must be at most 12 (it is 8 + 12).';
    await expect(row.getByTestId('dashboard-widget-problems')).toHaveText(reason);
    await page.getByTestId('form-submit:dashboard:create').click();
    await expect(page).toHaveURL(/\/dashboards\/create$/);
    await expect(page.getByText(reason).first()).toBeVisible();
    expect(await dashboards()).toBe(0);

    await row.getByLabel('Column (0–11)').fill('0');
    await expect(row.getByTestId('dashboard-widget-problems')).toHaveCount(0);
    // The live preview draws the widget before it is saved.
    await expect(page.getByTestId('dashboard-grid').getByRole('region', { name: 'E2E key figures' })).toBeVisible();
    await page.getByTestId('form-submit:dashboard:create').click();
    await expect(page).toHaveURL(/\/dashboards\/[0-9a-f-]{36}$/);
    const tile = page.getByTestId('dashboard-grid').getByRole('region', { name: 'E2E key figures' });
    await expect(tile.locator('section[data-testid="kpis"]')).toBeVisible();
    expect(await dashboards()).toBe(1);

    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboards$/);
    await expect.poll(dashboards).toBe(0);
  });

  test('should show a failed seeded report with its error and Retry, and a completed one with its file', async () => {
    await page.goto('/reports');
    await page.getByTestId('list-saved-views:report').click();
    await page.getByRole('button', { name: 'Failed', exact: true }).click();
    const failedRow = page.getByRole('row', { name: new RegExp(FAILED_REPORT) });
    await expect(failedRow).toHaveCount(1);
    await failedRow.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('menuitem', { name: 'Retry' })).toBeVisible();
    await page.keyboard.press('Escape');

    await failedRow.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Generation failed' })).toBeVisible();
    await expect(page.getByText(FAILED_ERROR)).toBeVisible();
    await expect(page.getByTestId('report-step:failed')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('form-action:report:show:retry')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open/ })).toHaveCount(0);

    const completed = (
      await graphql<{ reports: { id: string }[] }>('query ($t: String!) { reports(where: {title: {_eq: $t}, status: {_eq: completed}}) { id } }', {
        t: COMPLETED_REPORT,
      })
    ).reports[0];
    if (completed === undefined) throw new Error(`the seed has no completed report “${COMPLETED_REPORT}”`);
    await page.goto(`/reports/${completed.id}`);
    await expect(page.getByTestId('report-step:completed')).toHaveAttribute('data-state', 'done');
    const open = page.getByRole('link', { name: /Open/ });
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('form-action:report:show:retry')).toHaveCount(0);
    // The short-lived link serves the file.
    const href = await open.getAttribute('href');
    expect(href).toBeTruthy();
    const file = await page.request.get(href ?? '');
    expect(file.status()).toBe(200);
    expect((await file.body()).length).toBeGreaterThan(0);
  });

  test('should refuse a report of more than 367 days before sending it', async () => {
    const title = `${RUN} year`;
    await page.goto('/reports');
    await page.getByTestId('list-flow:report:new_report').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /^Type/ }).click();
    await page.getByRole('option', { name: /^Busy hours/ }).click();
    await dialog.getByRole('textbox', { name: /^Title/ }).fill(title);
    await dialog.getByLabel(/^From/).fill('2025-01-01');
    await dialog.getByLabel(/^To/).fill('2026-01-03');
    await dialog.getByRole('button', { name: 'New report', exact: true }).click();
    await expect(dialog.getByText(/at most 367 days/)).toBeVisible();
    await expect(dialog).toBeVisible();
    const sent = await graphql<{ reports: unknown[] }>('query ($t: String!) { reports(where: {title: {_eq: $t}}) { id } }', { t: title });
    expect(sent.reports).toHaveLength(0);
    await page.keyboard.press('Escape');
  });
});
