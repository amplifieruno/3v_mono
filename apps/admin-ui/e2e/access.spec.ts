import { type Locator, type Page, expect, test } from '@playwright/test';
import {
  type PersonAtDoor,
  attributes,
  grantedPersonAtDoor,
  graphqlAs,
  localInput,
  removeAccessRun,
  signInSecondAdmin,
  visitorWithoutPolicy,
} from './access-support';
import { NOVA_FACILITY, devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const idOf = (page: Page): string => page.url().split('/').pop() ?? '';

/*
 * Access control end to end, in Nova Tower. A policy of this run is drafted (deny one seeded
 * person at one seeded door), simulated without writing, made valid from 2099 only (it never
 * decides a real door) and submitted; its submitter sees Approve disabled with the four-eyes
 * reason, the second admin (`nova.admin@itap.demo`, a browser context of their own) approves it,
 * it is in force, every reachable terminal holds it and "Publish policy to terminals" pushes it
 * again. A single-use grant reads Unused, "Test access" uses it up (Used, no Revoke), a reusable
 * grant for 2099 is revoked with a reason. An evacuation of one area starts, the banner names the
 * facility, "End now" with a reason ends it, the terminals receive the end and the banner goes.
 * afterAll removes everything the run wrote with the admin secret (`removeAccessRun`).
 */
test.describe.serial('access control smoke', () => {
  let page: Page;
  let approver: Page | null = null;
  let opened = false;
  const startedAt = new Date().toISOString();
  const policies = new Set<string>();
  const grants = new Set<string>();
  const overrides = new Set<string>();
  let denied: PersonAtDoor | undefined;
  let visitor: PersonAtDoor | undefined;
  let versionUrl = '';
  let facilityId = '';
  let areaName = '';

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    const nova = await graphqlAs<{ facilities: { id: string; areas: { name: string }[] }[] }>(
      page,
      'query ($n: String!) { facilities(where: { name: { _eq: $n } }) { id areas(order_by: { name: asc }, limit: 1) { name } } }',
      { n: NOVA_FACILITY },
    );
    facilityId = nova.facilities[0]?.id ?? '';
    areaName = nova.facilities[0]?.areas[0]?.name ?? '';
    expect(facilityId).toMatch(UUID);
    expect(areaName).not.toBe('');
    denied = await grantedPersonAtDoor(page);
    visitor = await visitorWithoutPolicy(page);
  });

  test.afterAll(async () => {
    if (!opened) return;
    test.setTimeout(90_000);
    try {
      const people = [denied?.profile, visitor?.profile].filter((id): id is string => !!id);
      await removeAccessRun({
        run: RUN,
        startedAt,
        facilityId,
        people,
        policies,
        grants,
        overrides,
      });
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : String(error);
      console.warn(`access smoke cleanup failed: ${description}`);
      test.info().annotations.push({ type: 'cleanup-failed', description });
    } finally {
      await approver?.context().close();
      await page.context().close();
    }
  });

  const main = (): Locator => page.getByRole('main');
  const dialog = (): Locator => page.getByRole('dialog');
  const seeded = (value: PersonAtDoor | undefined): PersonAtDoor => {
    if (value === undefined) throw new Error('beforeAll found no seeded person');
    return value;
  };
  const person = (): PersonAtDoor => seeded(denied);
  const guest = (): PersonAtDoor => seeded(visitor);

  /** Picks the option named `option` of a relation picker, after typing `search` into its search box. */
  async function pick(field: Locator, search: string, option: string): Promise<void> {
    await field.click();
    await page.getByRole('combobox').last().fill(search);
    await page.getByRole('option', { name: option }).first().click();
  }

  const versionStatus = async (): Promise<string> =>
    (
      await graphqlAs<{ access_policy_versions_by_pk: { status: string } }>(
        page,
        'query ($id: uuid!) { access_policy_versions_by_pk(id: $id) { status } }',
        { id: versionUrl.split('/').pop() },
      )
    ).access_policy_versions_by_pk.status;

  const decisionCount = (): Promise<unknown> =>
    graphqlAs(page, '{ access_decisions_aggregate { aggregate { count } } }');

  /** Creates a grant for the visitor at their door from the create page; answers its id. */
  async function createGrant(from: string, until: string, singleUse: boolean): Promise<string> {
    const field = (name: string) =>
      page.getByTestId(`form-field-input:access_grant:create:${name}`);
    await page.goto('/access-grants/create');
    await pick(field('profile_id'), guest().last, guest().name);
    await pick(field('access_point_id'), guest().doorName, guest().doorName);
    await field('valid_from').fill(from);
    await field('valid_until').fill(until);
    if (singleUse) await field('single_use').check();
    await field('reason').fill(`${RUN} visit`);
    await page.getByTestId('form-submit:access_grant:create').click();
    await expect(page).toHaveURL(/\/access-grants\/[0-9a-f-]{36}$/);
    grants.add(idOf(page));
    return idOf(page);
  }

  test('should draft a policy version, name a person and a door, and simulate it without writing', async () => {
    await page.goto('/access-policies/create');
    await page
      .getByTestId('form-field-input:access_policy:create:name')
      .fill(`${RUN} deny one person`);
    await page.getByTestId('form-submit:access_policy:create').click();
    await expect(page).toHaveURL(/\/access-policies\/[0-9a-f-]{36}$/);
    policies.add(idOf(page));

    await page.getByTestId('form-action:access_policy:show:draft_change').click();
    await expect(page).toHaveURL(/\/access-policy-versions\/[0-9a-f-]{36}$/);
    versionUrl = page.url();
    await expect(main().getByRole('heading', { name: 'Version 1', level: 2 })).toBeVisible();

    // Deny, above every seeded policy.
    await main().getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('form-field-input:access_policy_version:edit:effect').click();
    await page.getByRole('option', { name: /^Deny\b/ }).click();
    await page.getByTestId('form-field-input:access_policy_version:edit:priority').fill('1000');
    await page.getByTestId('form-submit:access_policy_version:edit').click();
    await expect(page).toHaveURL(versionUrl);

    // Who: the person (the first kind, People); Where: the door (the third kind, Access points).
    await main().getByRole('tab', { name: 'Who' }).click();
    const who = main().getByRole('tabpanel', { name: 'Who' });
    await who.getByRole('button', { name: 'Create' }).first().click();
    await pick(dialog().getByRole('combobox', { name: /^Person/ }), person().last, person().name);
    await dialog().getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    await expect(who.locator(`a[href="/profiles/${person().profile}"]`).first()).toBeVisible();

    await main().getByRole('tab', { name: 'Where' }).click();
    const where = main().getByRole('tabpanel', { name: 'Where' });
    await where.getByRole('button', { name: 'Create' }).nth(2).click();
    await pick(
      dialog().getByRole('combobox', { name: /^Access point/ }),
      person().doorName,
      person().doorName,
    );
    await dialog().getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    await expect(where.locator(`a[href="/access-points/${person().door}"]`).first()).toBeVisible();

    // The simulation: the seeded grant would have been a denial; nothing is recorded.
    const before = await decisionCount();
    await main().getByRole('button', { name: 'Simulate' }).click();
    const simulation = page.getByTestId('policy-simulation');
    await expect(simulation.getByTestId('simulation-summary')).toContainText(
      'would be denied instead of granted',
      {
        timeout: 30_000,
      },
    );
    await expect(
      simulation.locator('[data-testid="simulation-sample"][data-change="granted-denied"]').first(),
    ).toBeVisible();
    expect(await decisionCount()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(simulation).toHaveCount(0);
  });

  test('should submit the version, and not let its submitter approve it (four-eyes)', async () => {
    await page.goto(versionUrl);
    // Valid from 2099 only: in force, it never decides a real door.
    await main().getByRole('link', { name: 'Edit' }).click();
    await page
      .getByTestId('form-field-input:access_policy_version:edit:valid_from')
      .fill('2099-01-01T00:00');
    await page.getByTestId('form-submit:access_policy_version:edit').click();
    await expect(page).toHaveURL(versionUrl);

    await page.getByTestId('form-action:access_policy_version:show:submit').click();
    await expect(dialog().getByTestId('policy-version-review')).toBeVisible();
    await dialog().getByRole('button', { name: 'Submit for approval', exact: true }).last().click();
    await expect(dialog()).toHaveCount(0);
    await expect.poll(versionStatus).toBe('pending_approval');

    // Approve is shown disabled, with the four-eyes reason as its tooltip, and opens nothing.
    const approve = page.getByTestId('form-action:access_policy_version:show:approve');
    await expect(approve).toHaveAttribute('aria-disabled', 'true');
    await approve.hover();
    await expect(
      page.getByText(/another member must approve it \(four-eyes rule\)/).first(),
    ).toBeVisible();
    await approve.click({ force: true });
    await expect(dialog()).toHaveCount(0);
    expect(await versionStatus()).toBe('pending_approval');

    // Frozen: no edit, the subjects read only.
    await expect(main().getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await main().getByRole('tab', { name: 'Who' }).click();
    const who = main().getByRole('tabpanel', { name: 'Who' });
    await expect(who.locator(`a[href="/profiles/${person().profile}"]`).first()).toBeVisible();
    await expect(who.getByRole('button', { name: 'Create' })).toHaveCount(0);
  });

  test('should let the second admin approve it, put it in force and publish it to the terminals', async ({
    browser,
  }) => {
    approver = await signInSecondAdmin(browser);
    await approver.goto(versionUrl);
    const approve = approver.getByTestId('form-action:access_policy_version:show:approve');
    await expect(approve).not.toHaveAttribute('aria-disabled', 'true');
    await approve.click();
    const review = approver.getByRole('dialog');
    await expect(review.getByTestId('policy-version-review')).toBeVisible();
    await review.getByRole('button', { name: 'Approve', exact: true }).last().click();
    await expect(review).toHaveCount(0);
    await expect.poll(versionStatus).toBe('published');
    const [policyId] = [...policies];
    const policy = await graphqlAs<{ access_policies_by_pk: { current_version_id: string } }>(
      page,
      'query ($id: uuid!) { access_policies_by_pk(id: $id) { current_version_id } }',
      { id: policyId },
    );
    expect(policy.access_policies_by_pk.current_version_id).toBe(versionUrl.split('/').pop());
    await approver.reload();
    await expect(approver.getByRole('main').getByText('Published').first()).toBeVisible();

    // Every reachable terminal holds the rule set with the new version (approval pushes it urgently).
    await page.goto('/access-terminals');
    const rows = main().getByTestId('terminal-sync-row');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await attributes(rows, 'state')).every((s) => s === 'current' || s === 'unreachable'),
        {
          timeout: 60_000,
        },
      )
      .toBe(true);

    // Publishing again answers per terminal.
    await main()
      .getByRole('button', { name: /^Publish policy to terminals/ })
      .last()
      .click();
    const result = main()
      .getByTestId('publish-result')
      .filter({ has: page.getByTestId('publish-table') });
    await expect(result.getByTestId('publish-summary')).toContainText(/terminals synced/);
    const results = await attributes(result.getByTestId('publish-row'), 'result');
    expect(results).toContain('synced');
    expect(results.every((value) => value === 'synced' || value === 'unreachable')).toBe(true);
  });

  test('should show a single-use grant unused, use it up with Test access, and revoke another grant with a reason', async () => {
    await createGrant(localInput(-2), localInput(30), true);
    const grantUrl = page.url();
    await expect(main().locator('[data-use="unused"]').first()).toBeVisible();

    await page.goto(`/access-points/${guest().door}`);
    await page.getByTestId('form-action:access_point:show:test_access').click();
    await pick(dialog().getByRole('combobox', { name: /^Person/ }), guest().last, guest().name);
    await dialog().getByRole('button', { name: 'Test access', exact: true }).last().click();
    // The decision and how it was made: no policy decided, the grant let them through.
    await expect(dialog().getByTestId('trace-headline')).toContainText('Granted', {
      timeout: 30_000,
    });
    await expect(dialog().getByTestId('trace-decided-by')).toContainText(
      'an access grant of the person let them through',
    );
    await page.keyboard.press('Escape');

    // Used up: Used with the moment, and nothing left to revoke.
    await page.goto(grantUrl);
    await expect(main().locator('[data-use="used"]').first()).toBeVisible();
    await expect(page.getByTestId('form-action:access_grant:show:revoke')).toHaveCount(0);

    // A reusable grant for 2099 (it opens no real door now), revoked with a reason.
    await createGrant('2099-01-01T08:00', '2099-01-01T18:00', false);
    await expect(main().locator('[data-use="reusable"]').first()).toBeVisible();
    await page.getByTestId('form-action:access_grant:show:revoke').click();
    await dialog()
      .getByRole('textbox', { name: /^Reason/ })
      .fill(`${RUN} visit cancelled`);
    await dialog().getByRole('button', { name: 'Revoke', exact: true }).last().click();
    await expect(dialog()).toHaveCount(0);
    await expect(main().getByText(`${RUN} visit cancelled`)).toBeVisible();
    await expect(page.getByTestId('form-action:access_grant:show:revoke')).toHaveCount(0);
  });

  test('should start an override, show the banner for its facility, and end it with a reason', async () => {
    await page.goto('/emergency-overrides');
    await main().getByRole('button', { name: 'Start override', exact: true }).click();
    await pick(dialog().getByRole('combobox', { name: /^Facility/ }), NOVA_FACILITY, NOVA_FACILITY);
    await dialog().getByRole('combobox', { name: /^Mode/ }).click();
    await page.getByRole('option', { name: /^Evacuation\b/ }).click();
    await pick(dialog().getByRole('combobox', { name: /^Areas/ }), areaName, areaName);
    // A multi-pick stays open: close its list, not the dialog.
    await page.getByRole('combobox', { name: /^Search area/ }).press('Escape');
    await expect(dialog().getByRole('heading', { name: 'Start override' })).toBeVisible();
    await dialog().getByRole('textbox', { name: /^Ends/ }).fill(localInput(60));
    await dialog()
      .getByRole('textbox', { name: /^Justification/ })
      .fill(`${RUN} evacuation drill of one area`);
    await dialog().getByRole('button', { name: 'Start override', exact: true }).click();
    await expect(page).toHaveURL(/\/emergency-overrides\/[0-9a-f-]{36}$/);
    const overrideId = idOf(page);
    overrides.add(overrideId);

    // The banner names the facility and links the override, on every page.
    const banner = page.getByTestId('override-banner');
    const link = banner.locator(`a[href="/emergency-overrides/${overrideId}"]`);
    await expect(banner).toContainText(NOVA_FACILITY);
    await expect(link).toHaveCount(1);
    await page.goto('/dashboard');
    await expect(
      banner
        .getByTestId('override-banner:item')
        .filter({ has: page.locator(`a[href="/emergency-overrides/${overrideId}"]`) }),
    ).toContainText('Evacuation');

    await page.goto(`/emergency-overrides/${overrideId}`);
    await page.getByTestId('form-action:emergency_override:show:end').click();
    await dialog()
      .getByRole('textbox', { name: /^Reason/ })
      .fill(`${RUN} drill over`);
    await dialog().getByRole('button', { name: 'End now', exact: true }).last().click();
    await expect(dialog()).toHaveCount(0);
    await expect(main().getByText(`${RUN} drill over`)).toBeVisible();
    await expect(page.getByTestId('form-action:emergency_override:show:end')).toHaveCount(0);

    // Every reachable terminal receives the end (an urgent push); an offline one reads unreachable.
    await main().getByRole('tab', { name: 'Terminals' }).click();
    const rows = main().getByTestId('terminal-sync-row');
    await expect(rows.first()).toBeVisible();
    await expect
      .poll(
        async () =>
          (await attributes(rows, 'state')).every((s) => s === 'received' || s === 'unreachable'),
        {
          timeout: 60_000,
        },
      )
      .toBe(true);
    expect(await attributes(rows, 'state')).toContain('received');
    // Gone from the banner (it reads again every half minute).
    await expect(link).toHaveCount(0, { timeout: 45_000 });
  });
});
