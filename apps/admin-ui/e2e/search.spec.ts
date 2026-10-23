import { type Locator, type Page, expect, test } from '@playwright/test';
import { DEV_GRAPHQL, DEV_STORAGE, devAdminSecret } from '../tests/support/dev-hosts';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
const INSIGHTFACE_URL = process.env.INSIGHTFACE_URL ?? 'http://127.0.0.1:18080';

/** A crop of a seeded employee (backend/seed-assets/faces): enrolled, so it finds that person first and exact. */
const ENROLLED_PHOTO = new URL('../../backend/seed-assets/faces/person-03/1.jpg', import.meta.url).pathname;
const ENROLLED_PERSON = 'Thomas Kirby';
/** An image without a face (backend test fixture). */
const NO_FACE_PHOTO = new URL('../../backend/tests/fixtures/faces/no-face.jpg', import.meta.url).pathname;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** Runs SQL with the admin secret: test cleanup only (history rows and files are not the console's to delete). */
async function runSql(sql: string): Promise<string[][]> {
  const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  const body = (await response.json()) as { result?: string[][]; error?: string };
  if (!response.ok) throw new Error(`run_sql: ${JSON.stringify(body)}`);
  return (body.result ?? []).slice(1);
}

async function insightfaceUp(): Promise<boolean> {
  try {
    return (await fetch(`${INSIGHTFACE_URL}/info`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

/** A CSV of `count` dry-run profile rows. */
const manyRows = (count: number): string =>
  ['first_name,last_name', ...Array.from({ length: count }, (_, i) => `E2e,Cancel${i}`)].join('\r\n') + '\r\n';

/*
 * One browser page for the whole flow, opened from the run's shared admin session (Nova Tower).
 * Writes: the run's searches (history rows and their uploaded photos), one saved search the console
 * deletes, and two dry-run bulk jobs (nothing imported) with their input and result files. afterAll
 * removes all of them with the admin secret: the requests and jobs this run opened plus anything the
 * admin started by hand after the run began, the photos, CSVs and result files, and the saved search
 * by its name should a step fail before the console deleted it.
 */
test.describe.serial('search and bulk smoke', () => {
  let page: Page;
  let opened = false;
  let userId = '';
  const startedAt = new Date().toISOString();
  const requests = new Set<string>();
  const jobs = new Set<string>();
  const SAVED = `${RUN} attribute search`;

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    userId = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as { org?: { accessToken: string } };
      const claims = JSON.parse(atob((stored.org?.accessToken ?? '..').split('.')[1]?.replaceAll('-', '+').replaceAll('_', '/') ?? '')) as Record<
        string,
        Record<string, string>
      >;
      return claims['https://hasura.io/jwt/claims']?.['x-hasura-user-id'] ?? '';
    });
    expect(userId).toMatch(UUID);
  });

  test.afterAll(async () => {
    if (!opened) return;
    try {
      const mine = `user_id = '${userId}' and created_at >= '${startedAt}'`;
      const ids = (set: Set<string>) => [...set].map((id) => `'${id}'`).join(', ') || 'null';
      const searchRows = await runSql(
        `select id, image_file_id from itap.search_requests where id in (${ids(requests)}) or (${mine} and saved_search_id is null and bulk_job_id is null)`,
      );
      const jobRows = await runSql(
        `select id, input_file_id, result_file_id from itap.bulk_jobs where id in (${ids(jobs)}) or (owner_id = '${userId}' and created_at >= '${startedAt}')`,
      );
      const files = new Set([...searchRows.map((row) => row[1]), ...jobRows.flatMap((row) => [row[1], row[2]])].filter((id): id is string => !!id && UUID.test(id)));
      if (searchRows.length > 0) await runSql(`delete from itap.search_requests where id in (${searchRows.map((row) => `'${row[0]}'`).join(', ')})`);
      if (jobRows.length > 0) await runSql(`delete from itap.bulk_jobs where id in (${jobRows.map((row) => `'${row[0]}'`).join(', ')})`);
      await runSql(`delete from itap.saved_searches where name = '${SAVED.replaceAll("'", "''")}'`);
      for (const id of files) {
        await fetch(`${DEV_STORAGE}/v1/files/${id}`, { method: 'DELETE', headers: { 'x-hasura-admin-secret': devAdminSecret() } });
      }
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : String(error);
      console.warn(`search smoke cleanup failed: ${description}`);
      test.info().annotations.push({ type: 'cleanup-failed', description });
    } finally {
      await page.context().close();
    }
  });

  const main = (): Locator => page.getByRole('main');
  const dialog = (): Locator => page.getByRole('dialog');
  /** The id in the page's URL after `/<path>/`, remembered for cleanup. */
  const idIn = (path: string, into: Set<string>): string => {
    const id = new URL(page.url()).pathname.split(`/${path}/`)[1] ?? '';
    expect(id).toMatch(UUID);
    into.add(id);
    return id;
  };
  const rememberHistoryLink = async (): Promise<string> => {
    const href = (await main().getByRole('link', { name: 'Open in search history' }).getAttribute('href')) ?? '';
    const id = href.split('/search-history/')[1] ?? '';
    expect(id).toMatch(UUID);
    requests.add(id);
    return id;
  };

  /** Searches the Search page with one photo; answers the new request's id. */
  async function searchWith(photo: string): Promise<string> {
    await page.goto('/search');
    await expect(main().getByRole('spinbutton', { name: 'Threshold' })).not.toHaveValue('');
    await main().locator('input[type=file]').first().setInputFiles(photo);
    await expect(main().getByRole('img', { name: 'Photo 1' })).toBeVisible();
    await main().getByRole('button', { name: 'Search', exact: true }).click();
    await expect(main().getByTestId('search-outcome')).toBeVisible({ timeout: 60_000 });
    return rememberHistoryLink();
  }

  test('should find the enrolled person by their photo, first and exact', async () => {
    test.skip(!(await insightfaceUp()), 'insightface is down: no face analysis');
    await searchWith(ENROLLED_PHOTO);
    const first = main().getByTestId('search-result').first();
    await expect(first).toHaveAttribute('data-match-type', 'exact');
    await expect(first.getByText('Exact')).toBeVisible();
    await expect(first.getByRole('link', { name: ENROLLED_PERSON })).toHaveAttribute('href', /^\/profiles\//);
    await expect(first.getByRole('link', { name: /^IDENTITY-\d+$/ })).toBeVisible();
  });

  test('should show a photo without a face as its own outcome, not an empty result', async () => {
    test.skip(!(await insightfaceUp()), 'insightface is down: no face analysis');
    await searchWith(NO_FACE_PHOTO);
    const outcome = main().getByTestId('search-outcome');
    await expect(outcome).toHaveAttribute('data-outcome', 'photo');
    await expect(outcome).toContainText('No face was found in the photo');
    await expect(main().getByTestId('search-result')).toHaveCount(0);
  });

  test('should list the run’s own searches in the history and run one again', async () => {
    test.skip(requests.size === 0, 'no search of this run to find');
    await page.goto('/search-history');
    for (const id of requests) await expect(main().locator(`a[href="/search-history/${id}"]`)).toHaveCount(1);
    const [enrolled] = [...requests];
    await page.goto(`/search-history/${enrolled}`);
    await expect(main().getByTestId('search-result').first()).toBeVisible();
    await main().getByRole('button', { name: /^Run again/ }).first().click();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole('button', { name: 'Run again', exact: true }).last().click();
    await expect(page).not.toHaveURL(new RegExp(`/search-history/${enrolled}$`));
    await expect(page).toHaveURL(/\/search-history\/[0-9a-f-]{36}$/);
    idIn('search-history', requests);
    await expect(main().getByTestId('search-result').first()).toHaveAttribute('data-match-type', 'exact');
    await expect(main().getByTestId('search-result').first().getByRole('link', { name: ENROLLED_PERSON })).toBeVisible();
  });

  test('should create a saved search, run it now, warn about the baseline on a changed definition, and delete it', async () => {
    await page.goto('/saved-searches');
    await main().getByRole('button', { name: 'New saved search', exact: true }).click();
    await dialog().getByRole('textbox', { name: /^Name/ }).fill(SAVED);
    await dialog().getByRole('combobox', { name: /^Search by/ }).click();
    await page.getByRole('option', { name: /^Attributes/ }).click();
    await dialog().getByRole('spinbutton', { name: /^Results at most/ }).fill('5');
    await dialog().getByRole('button', { name: 'New saved search', exact: true }).last().click();
    await expect(page).toHaveURL(/\/saved-searches\/[0-9a-f-]{36}$/);
    const savedUrl = page.url();
    await expect(main().getByRole('heading', { name: SAVED, level: 2 })).toBeVisible();

    await main().getByRole('button', { name: /^Run now/ }).first().click();
    await expect(page).toHaveURL(/\/search-history\/[0-9a-f-]{36}$/);
    idIn('search-history', requests);
    await expect(main().getByTestId('search-outcome')).toBeVisible();

    await page.goto(savedUrl);
    await main().getByRole('button', { name: /^Edit/ }).first().click();
    await dialog().getByRole('spinbutton', { name: /^Results at most/ }).fill('7');
    await dialog().getByRole('button', { name: 'Edit', exact: true }).last().click();
    await expect(dialog().getByText(/resets its alert baseline/)).toBeVisible();
    await dialog().getByRole('button', { name: 'Edit', exact: true }).last().click();
    await expect(dialog()).toHaveCount(0);
    await expect(main().getByText('7', { exact: true }).first()).toBeVisible();

    await main().getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(dialog()).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/saved-searches$/);
    expect(await runSql(`select id from itap.saved_searches where name = '${SAVED}'`)).toHaveLength(0);
  });

  test('should import a CSV as a dry run and show the failed row with counts that add up', async () => {
    test.setTimeout(120_000);
    await page.goto('/bulk-jobs');
    await main().getByRole('button', { name: 'Import profiles', exact: true }).click();
    const csv = `first_name,last_name,email\r\nE2e,Valid,${RUN}@example.com\r\nE2e,,\r\n`;
    await dialog().locator('input[type=file]').setInputFiles({ name: `${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(dialog().getByRole('link', { name: /Open file/ })).toBeVisible();
    await dialog().getByRole('checkbox', { name: /^Dry run/ }).check();
    await dialog().getByRole('button', { name: 'Import profiles', exact: true }).last().click();
    await expect(page).toHaveURL(/\/bulk-jobs\/[0-9a-f-]{36}$/);
    idIn('bulk-jobs', jobs);
    await expect(page.getByText(/^Job BULK-\d+ is queued/)).toBeVisible();

    const progress = main().getByTestId('bulk-job-progress');
    await expect(progress).toHaveAttribute('data-status', 'partial', { timeout: 60_000 });
    await expect(main().getByTestId('bulk-job-sum')).toHaveText('2 rows: 1 succeeded, 1 failed, 0 skipped');
    await expect(main().getByText('The “last_name” column is empty; this row needs it.')).toBeVisible();
    await expect(main().getByRole('link', { name: /Open file/ }).first()).toBeVisible();
  });

  test('should cancel a queued job, which then says it was cancelled', async () => {
    test.setTimeout(120_000);
    await page.goto('/bulk-jobs');
    await main().getByRole('button', { name: 'Import profiles', exact: true }).click();
    await dialog().locator('input[type=file]').setInputFiles({ name: `${RUN}-many.csv`, mimeType: 'text/csv', buffer: Buffer.from(manyRows(10_000)) });
    await expect(dialog().getByRole('link', { name: /Open file/ })).toBeVisible();
    await dialog().getByRole('checkbox', { name: /^Dry run/ }).check();
    await dialog().getByRole('button', { name: 'Import profiles', exact: true }).last().click();
    await expect(page).toHaveURL(/\/bulk-jobs\/[0-9a-f-]{36}$/);
    idIn('bulk-jobs', jobs);

    await main().getByRole('button', { name: /^Cancel job/ }).first().click();
    await page.getByRole('alertdialog').or(dialog()).getByRole('button', { name: /Cancel job|Confirm|Continue/ }).last().click();
    await expect(main().getByTestId('bulk-job-progress')).toHaveAttribute('data-status', 'cancelled', { timeout: 30_000 });
    await expect(main().getByText('Cancelled: the job stopped; rows applied before stay applied.')).toBeVisible();
    await expect(main().getByText('Checking for progress every few seconds…')).toHaveCount(0);
    // Stopped well before its 10 000 rows: a job cancelled while queued never read its file (no sum),
    // one cancelled while running counts the rows it never reached.
    const sum = main().getByTestId('bulk-job-sum');
    if ((await sum.count()) > 0) await expect(sum).toContainText('not reached');
    await expect(main().getByRole('button', { name: /^Cancel job/ })).toHaveCount(0);
    await expect(main().getByRole('button', { name: /^Retry/ })).toHaveCount(0);
  });
});

