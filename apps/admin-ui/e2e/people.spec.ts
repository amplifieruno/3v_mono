import { type Page, type Request, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
/** The marker every profile of the run carries in its last name (profiles cannot be deleted). */
const VISITOR_LAST = `${RUN} Visitor`;
const INSIGHTFACE_URL = process.env.INSIGHTFACE_URL ?? 'http://127.0.0.1:18080';

/** A minimal one-page PDF, enough for the document upload. */
const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/*
 * One browser page for the whole flow, opened from the run's shared admin session. The run
 * creates a visitor profile with two visits, a document, and an identity; it merges two seeded
 * identities and rolls the merge back. Cleanup: profiles cannot be deleted, so the visitor is set
 * inactive (its last name carries the run marker); visits and documents have no delete either and
 * stay (the visits cancelled or checked out); the created identity is archived; the merge is
 * rolled back by the test itself (and by the afterAll sweep if a step failed halfway).
 */
test.describe.serial('people smoke', () => {
  let page: Page;
  let opened = false;
  let profileId = '';
  let identityId = '';
  /** The merge the run made, for the sweep (rolled back by the test when it gets that far). */
  let mergeId = '';
  /** Visits the run scheduled; any still scheduled at the end are cancelled (a visit cannot be deleted). */
  const visitIds: string[] = [];
  /** The seeded identity the verification step approved, with the status it had (put back after). */
  let verifiedSeed: { id: string; status: string } | undefined;
  const graphqlBodies: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    page.on('request', (request: Request) => {
      if (request.method() === 'POST' && request.url().includes('/v1/graphql')) {
        graphqlBodies.push(request.postData() ?? '');
      }
    });
  });

  test.afterAll(async () => {
    if (!opened) return;
    /** Runs one cleanup step; a failure is reported (a leftover of the run), never swallowed. */
    const step = async (name: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (error: unknown) {
        const description = `${name}: ${error instanceof Error ? error.message : String(error)}`;
        console.warn(`people smoke cleanup failed: ${description}`);
        test.info().annotations.push({ type: 'cleanup-failed', description });
      }
    };
    try {
      if (mergeId !== '') {
        await step(`roll back merge ${mergeId}`, () =>
          graphql('mutation ($id: uuid!) { rollback_merge(args: {p_merge_id: $id}) { id } }', { id: mergeId }),
        );
      }
      for (const id of visitIds) {
        // The run's visits end checked out or cancelled; only one a failed step left scheduled is cancelled.
        await step(`cancel visit ${id}`, async () => {
          if ((await visitRow(id)).status !== 'scheduled') return;
          await graphql('mutation ($id: uuid!) { cancel_visit(args: {p_visit: $id, p_reason: "e2e cleanup"}) { id } }', { id });
        });
      }
      if (profileId !== '') {
        await step(`deactivate profile ${profileId}`, () =>
          graphql('mutation ($id: uuid!) { update_profiles_by_pk(pk_columns: {id: $id}, _set: {status: inactive}) { id } }', {
            id: profileId,
          }),
        );
      }
      if (verifiedSeed) {
        const seed = verifiedSeed;
        await step(`restore identity ${seed.id}`, () =>
          graphql('mutation ($id: uuid!, $s: identity_statuses_enum!) { update_identities_by_pk(pk_columns: {id: $id}, _set: {status: $s}) { id } }', {
            id: seed.id,
            s: seed.status,
          }),
        );
      }
      if (identityId !== '') {
        await step(`archive identity ${identityId}`, () =>
          graphql('mutation ($id: uuid!) { update_identities_by_pk(pk_columns: {id: $id}, _set: {status: archived}) { id } }', {
            id: identityId,
          }),
        );
      }
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation with the stored organization token (setup, check and restore steps). */
  async function graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return page.evaluate(
      async ({ q, v }) => {
        const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as {
          org?: { accessToken: string };
        };
        const response = await fetch('/v1/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${stored.org?.accessToken ?? ''}`,
          },
          body: JSON.stringify({ query: q, variables: v }),
        });
        const body = (await response.json()) as { data?: unknown; errors?: unknown };
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        return body.data as T;
      },
      { q: query, v: variables },
    );
  }

  async function insightfaceUp(): Promise<boolean> {
    try {
      return (await fetch(`${INSIGHTFACE_URL}/info`, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  }

  /** A local `YYYY-MM-DDTHH:mm` for the date-time input, `minutes` from now. */
  function localInput(minutes: number): string {
    const at = new Date(Date.now() + minutes * 60_000);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  }

  /** Schedules a visit for the visitor today through the create form; returns the visit's id. */
  async function scheduleVisit(): Promise<string> {
    await page.goto(`/visits/create?prefill.visitor_profile_id=${profileId}`);
    await page.getByTestId('form-field-input:visit:create:expected_start').fill(localInput(-15));
    await page.getByTestId('form-field-input:visit:create:expected_end').fill(localInput(120));
    await page.getByTestId('form-submit:visit:create').click();
    await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    visitIds.push(id);
    return id;
  }

  async function visitRow(id: string): Promise<{ status: string; checked_in_at: string | null; checked_out_at: string | null }> {
    const data = await graphql<{
      visits_by_pk: { status: string; checked_in_at: string | null; checked_out_at: string | null };
    }>('query ($id: uuid!) { visits_by_pk(id: $id) { status checked_in_at checked_out_at } }', { id });
    return data.visits_by_pk;
  }

  /** Runs a record action that sits in the page's "More" menu. */
  async function menuAction(name: string): Promise<void> {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name }).click();
  }

  /** How many dialogs are open right now. */
  const dialogs = (): ReturnType<Page['getByRole']> => page.getByRole('dialog');

  test('should create a visitor profile and schedule, check in and check out a visit', async () => {
    await page.goto('/profiles/create?type=visitor');
    await page.getByTestId('form-field-input:profile:create:first_name').fill('Ada');
    await page.getByTestId('form-field-input:profile:create:last_name').fill(VISITOR_LAST);
    await page.getByTestId('form-submit:profile:create').click();
    await expect(page).toHaveURL(/\/profiles\/[0-9a-f-]{36}$/);
    profileId = page.url().split('/').pop() ?? '';
    await expect(page.getByText(VISITOR_LAST).first()).toBeVisible();
    // The heading is the whole name (the computed `full_name`, gap G29).
    await expect(page.getByRole('heading', { name: `Ada ${VISITOR_LAST}` }).first()).toBeVisible();
    for (const tab of ['Details', 'Identities', 'Documents', 'Visits']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }

    const visitId = await scheduleVisit();
    expect((await visitRow(visitId)).status).toBe('scheduled');

    // Check in: a form (badge), then the status and the arrival time show.
    await page.getByTestId('form-action:visit:show:check_in').click();
    await dialogs().getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.getByText('Checked in', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await visitRow(visitId)).status).toBe('checked_in');
    const afterIn = await visitRow(visitId);
    expect(afterIn.status).toBe('checked_in');
    expect(afterIn.checked_in_at).not.toBeNull();
    expect(Math.abs(Date.now() - new Date(afterIn.checked_in_at ?? '').getTime())).toBeLessThan(5 * 60_000);

    // Check out: a single confirm.
    await page.getByTestId('form-action:visit:show:check_out').click();
    await expect(dialogs()).toHaveCount(1);
    await dialogs().getByRole('button', { name: 'Check out', exact: true }).click();
    await expect(page.getByText('Checked out', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await visitRow(visitId)).status).toBe('checked_out');
    const afterOut = await visitRow(visitId);
    expect(afterOut.status).toBe('checked_out');
    expect(new Date(afterOut.checked_out_at ?? '').getTime()).toBeGreaterThanOrEqual(
      new Date(afterOut.checked_in_at ?? '').getTime(),
    );

    // The visit is listed on the visitor's Visits tab.
    await page.goto(`/profiles/${profileId}`);
    await page.getByRole('tab', { name: 'Visits' }).click();
    await expect(page.getByText('Checked out', { exact: true }).first()).toBeVisible();
  });

  test('should cancel a scheduled visit through one confirmation', async () => {
    const visitId = await scheduleVisit();
    await menuAction('Cancel visit');
    // Not a form dialog followed by a second confirmation dialog.
    await expect(dialogs()).toHaveCount(1);
    await dialogs().getByRole('textbox').fill('e2e cancel');
    // The form and its confirmation are two steps of that one dialog (Back / Cancel / confirm).
    await dialogs().getByRole('button', { name: /^(continue|next|review|cancel visit)$/i }).last().click();
    await expect(dialogs().getByText('Cancel this visit?')).toBeVisible();
    await expect(dialogs()).toHaveCount(1);
    await dialogs().getByRole('button', { name: 'Cancel visit', exact: true }).last().click();
    await expect(dialogs()).toHaveCount(0);
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await visitRow(visitId)).status).toBe('cancelled');
    const row = await visitRow(visitId);
    expect(row.status).toBe('cancelled');
    expect(row.checked_in_at).toBeNull();
  });

  test('should upload a PDF document to the profile and open it on every click', async () => {
    await page.goto(`/profiles/${profileId}`);
    await menuAction('Upload document');
    await dialogs().getByRole('textbox', { name: /^Title/ }).fill(`${RUN} Contract`);
    await dialogs().locator('input[type=file]').setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: PDF });
    await dialogs().getByRole('button', { name: 'Upload document', exact: true }).click();
    await expect(dialogs()).toHaveCount(0);

    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText(`${RUN} Contract`)).toBeVisible();
    const opens = (): number => graphqlBodies.filter((body) => body.includes('open_file')).length;
    const before = opens();
    for (let click = 1; click <= 2; click += 1) {
      const popup = page.waitForEvent('popup');
      await page.getByRole('row', { name: new RegExp(RUN) }).getByRole('button', { name: 'Open file' }).click();
      await (await popup).close();
      await expect.poll(opens).toBe(before + click);
    }
  });

  /**
   * Submits the "Create identity from photos" form with one photo; resolves to the created
   * identity's id (from the action's answer) or the form's refusal.
   */
  async function createIdentityFrom(photo: string): Promise<{ identityId: string; refusal: string }> {
    await page.goto('/identities');
    await page.getByTestId('list-flow:identity:create_from_photos').click();
    const uploaded = page.waitForResponse((response) => response.url().includes('/storage') && response.request().method() === 'POST');
    await dialogs().locator('input[type=file]').first().setInputFiles(photo);
    // The photo is stored and chosen before the form is sent (a click while it uploads sends nothing).
    await uploaded;
    await expect(dialogs().getByRole('button', { name: 'Remove photo 1' })).toBeVisible();
    const answered = page.waitForResponse(
      (response) => response.url().includes('/v1/graphql') && (response.request().postData() ?? '').includes('create_identity_from_photos'),
      { timeout: 60_000 },
    );
    await dialogs().getByTestId('flow-submit:default:identity/actions/create_from_photos').click();
    const body = (await (await answered).json()) as { data?: { create_identity_from_photos?: { identity_id?: string } } };
    const result = page.getByTestId('enrollment-result');
    const refusal = dialogs().getByText(/already belongs to IDENTITY-\d+|No photo/).first();
    await expect(result.or(refusal)).toBeVisible({ timeout: 60_000 });
    const created = body.data?.create_identity_from_photos?.identity_id ?? '';
    if (created !== '') return { identityId: created, refusal: '' };
    const text = (await refusal.textContent()) ?? '';
    await page.keyboard.press('Escape');
    return { identityId: '', refusal: text };
  }

  test('should refuse a known face, then create an identity from a new one with its per-photo result', async () => {
    test.skip(!(await insightfaceUp()), 'insightface is down: no face analysis');
    // Up to three analyses in a row (a refusal, then up to two creations of about 20 s each).
    test.setTimeout(180_000);
    // A crop of a seeded "unknown" person (backend/seed-assets/faces), already an identity.
    const known = new URL('../../backend/seed-assets/faces/person-10/1.jpg', import.meta.url).pathname;
    const refused = await createIdentityFrom(known);
    expect(refused.identityId).toBe('');
    expect(refused.refusal).toMatch(/already belongs to IDENTITY-\d+/);

    // Faces the seed does not enrol (two distinct people; the run archives the identity it
    // creates, and archived identities no longer match, so the next run can reuse the face).
    // A face is skipped only when an active identity holds it: a run that failed before its
    // cleanup, or another test that created one.
    const fresh = ['../../backend/tests/fixtures/faces/person-a-1.jpg', '../../backend/tests/fixtures/faces/person-b.jpg'].map(
      (path) => new URL(path, import.meta.url).pathname,
    );
    for (const photo of fresh) {
      const attempt = await createIdentityFrom(photo);
      if (attempt.identityId === '') continue;
      identityId = attempt.identityId;
      await page.goto(`/identities/${identityId}`);
      await expect(page.getByText(/IDENTITY-\d+/).first()).toBeVisible();
      return;
    }
    test.info().annotations.push({
      type: 'note',
      description: 'both spare faces belong to an active identity (a failed earlier run?): creation step skipped',
    });
  });

  /** The status, profile link and photo ids of the identities, to compare after a rollback. */
  async function identityStates(ids: string[]): Promise<string> {
    const data = await graphql<{
      identities: { id: string; status: string; profile_id: string | null }[];
      identity_photos: { id: string; identity_id: string }[];
    }>(
      `query ($ids: [uuid!]!) {
        identities(where: {id: {_in: $ids}}, order_by: {code: asc}) { id status profile_id }
        identity_photos(where: {identity_id: {_in: $ids}}, order_by: {id: asc}) { id identity_id } }`,
      { ids },
    );
    // The exact photos of each identity: a rollback must give back the very rows the merge moved.
    const photos = (id: string): string[] => data.identity_photos.filter((row) => row.identity_id === id).map((row) => row.id);
    return JSON.stringify(data.identities.map((row) => [row.id, row.status, row.profile_id, photos(row.id)]));
  }

  test('should merge two seeded identities into one and roll the merge back', async () => {
    const found = await graphql<{ identities: { id: string; code: string }[] }>(
      `{ identities(where: {profile_id: {_is_null: true}, is_synthetic: {_eq: false}, status: {_eq: unverified}},
        order_by: {code: asc}, limit: 2) { id code } }`,
    );
    const [kept, merged] = found.identities;
    if (!kept || !merged) throw new Error('the seed has no two unlinked unverified identities');
    const before = await identityStates([kept.id, merged.id]);

    await page.goto(`/identities/${kept.id}`);
    await menuAction('Merge into this identity');
    await dialogs().getByRole('combobox').first().click();
    await page.getByRole('combobox', { name: 'Search identity…' }).fill(merged.code);
    await page.getByRole('option', { name: new RegExp(merged.code) }).click();
    // The multi-select stays open after a choice: close it, leaving the merge dialog.
    const search = page.getByRole('combobox', { name: 'Search identity…' });
    if (await search.isVisible()) await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(dialogs().getByTestId('identity-merge-review')).toBeVisible();
    await dialogs().getByRole('button', { name: /^(continue|next|review|merge)/i }).last().click();
    await expect(dialogs().getByText('Merge the chosen identities into this one?')).toBeVisible();
    await expect(dialogs()).toHaveCount(1);
    await dialogs().getByRole('button', { name: /^merge/i }).last().click();
    await expect(dialogs()).toHaveCount(0, { timeout: 30_000 });

    await expect
      .poll(async () => (await identityStates([merged.id])).includes('"merged"'), { timeout: 15_000 })
      .toBe(true);
    const merges = await graphql<{ identity_merges: { id: string; status: string }[] }>(
      'query ($t: uuid!) { identity_merges(where: {target_identity_id: {_eq: $t}}, order_by: {created_at: desc}, limit: 1) { id status } }',
      { t: kept.id },
    );
    mergeId = merges.identity_merges[0]?.id ?? '';
    expect(merges.identity_merges[0]?.status).toBe('completed');

    await page.goto(`/identity-merges/${mergeId}`);
    await page.getByRole('button', { name: 'Roll back', exact: true }).click();
    await expect(dialogs().getByTestId('merge-rollback-review')).toBeVisible();
    await dialogs().getByRole('button', { name: /^(continue|next|review|roll back)/i }).last().click();
    await expect(dialogs()).toHaveCount(1);
    await dialogs().getByRole('button', { name: 'Roll back', exact: true }).last().click();
    await expect(dialogs()).toHaveCount(0);
    await expect
      .poll(async () => (await graphql<{ identity_merges_by_pk: { status: string } }>(
        'query ($id: uuid!) { identity_merges_by_pk(id: $id) { status } }', { id: mergeId },
      )).identity_merges_by_pk.status)
      .toBe('rolled_back');
    mergeId = '';
    expect(await identityStates([kept.id, merged.id])).toBe(before);
  });

  test('should ask for a verification of an identity and approve it', async () => {
    // A seeded unverified identity; its status is put back below (the approved request stays).
    const found = await graphql<{ identities: { id: string; status: string }[] }>(
      `{ identities(where: {profile_id: {_is_null: true}, is_synthetic: {_eq: false}, status: {_eq: unverified}},
        order_by: {code: asc}, offset: 2, limit: 1) { id status } }`,
    );
    const target = found.identities[0];
    if (!target) throw new Error('the seed has no unverified identity to verify');
    verifiedSeed = { id: target.id, status: target.status };

    await page.goto(`/verification-requests/create?prefill.identity_id=${target.id}`);
    await page.getByRole('textbox', { name: /^Reason/ }).fill(`${RUN} check against the ID card`);
    await page.getByTestId('form-submit:verification_request:create').click();
    await expect(page).toHaveURL(/\/verification-requests\/[0-9a-f-]{36}$/);
    const requestId = page.url().split('/').pop() ?? '';
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await dialogs().getByRole('button', { name: 'Approve', exact: true }).last().click();
    // The confirmation is a step of the same dialog when the form comes first.
    const again = dialogs().getByRole('button', { name: 'Approve', exact: true });
    if (await again.last().isVisible().catch(() => false)) await again.last().click();
    await expect(dialogs()).toHaveCount(0);
    await expect
      .poll(async () => (await graphql<{ verification_requests_by_pk: { status: string } }>(
        'query ($id: uuid!) { verification_requests_by_pk(id: $id) { status } }', { id: requestId },
      )).verification_requests_by_pk.status)
      .toBe('approved');
    const identity = await graphql<{ identities_by_pk: { status: string } }>(
      'query ($id: uuid!) { identities_by_pk(id: $id) { status } }', { id: target.id },
    );
    expect(identity.identities_by_pk.status).toBe('verified');
  });
});
