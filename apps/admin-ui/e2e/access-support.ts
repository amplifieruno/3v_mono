import { type Browser, type Locator, type Page, expect } from '@playwright/test';
import { NOVA_ADMIN_EMAIL, seedPassword } from '../tests/support/dev-hosts';

/** A `datetime-local` value (the browser's local time) `minutes` from now. */
export function localInput(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The `data-<attribute>` values of every element `rows` matches (states of terminal rows, results). */
export const attributes = (rows: Locator, attribute: string): Promise<(string | null)[]> =>
  rows.evaluateAll((list, name) => list.map((row) => row.getAttribute(name)), `data-${attribute}`);

/** Signs the second Nova administrator in, in a browser context of their own (four-eyes approver). */
export async function signInSecondAdmin(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(NOVA_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

/** Runs one GraphQL operation as the page's signed-in member (the stored organization token). */
export async function graphqlAs<T>(
  page: Page,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
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

/** A seeded person and a door, with the names the pickers show. */
export interface PersonAtDoor {
  readonly profile: string;
  readonly last: string;
  readonly name: string;
  readonly door: string;
  readonly doorName: string;
}

/** The newest seeded decision (last 6 days) that let a known person through a door: the draft denies them there. */
export async function grantedPersonAtDoor(page: Page): Promise<PersonAtDoor> {
  const data = await graphqlAs<{
    access_decisions: {
      profile_id: string;
      access_point_id: string;
      profile: { first_name: string; last_name: string };
      access_point: { name: string };
    }[];
  }>(
    page,
    `query ($since: timestamptz!) {
      access_decisions(where: { result: { _eq: granted }, profile_id: { _is_null: false },
          access_point_id: { _is_null: false }, decided_at: { _gte: $since } },
        order_by: { decided_at: desc }, limit: 1) {
        profile_id access_point_id profile { first_name last_name } access_point { name }
      }
    }`,
    { since: new Date(Date.now() - 6 * 86_400_000).toISOString() },
  );
  const row = data.access_decisions[0];
  if (row === undefined) throw new Error('the seed has no granted decision in the last 6 days');
  const { first_name, last_name } = row.profile;
  return {
    profile: row.profile_id,
    last: last_name,
    name: `${first_name} ${last_name}`,
    door: row.access_point_id,
    doorName: row.access_point.name,
  };
}

/**
 * A seeded visitor at a door where no policy decides (`no_rule`), found by asking the engine
 * (`check_access` records a decision each time: the run's cleanup removes the visitor's by time).
 */
export async function visitorWithoutPolicy(page: Page): Promise<PersonAtDoor> {
  const candidates = await graphqlAs<{
    profiles: { id: string; first_name: string; last_name: string }[];
    access_points: { id: string; name: string }[];
  }>(
    page,
    `{
      profiles(where: { status: { _eq: active }, profile_type: { _eq: visitor } }, order_by: { code: asc }, limit: 6) {
        id first_name last_name
      }
      access_points(where: { status: { _eq: active } }, order_by: { name: asc }, limit: 6) { id name }
    }`,
  );
  for (const person of candidates.profiles) {
    for (const door of candidates.access_points) {
      const answer = await graphqlAs<{ check_access: { reason: string }[] }>(
        page,
        'mutation ($p: uuid!, $d: uuid!) { check_access(args: { access_point_id: $d, profile_id: $p, identity_id: null }) { reason } }',
        { p: person.id, d: door.id },
      );
      if (answer.check_access[0]?.reason === 'no_rule')
        return {
          profile: person.id,
          last: person.last_name,
          name: `${person.first_name} ${person.last_name}`,
          door: door.id,
          doorName: door.name,
        };
    }
  }
  throw new Error('no seeded visitor without a policy at a seeded door');
}

/** Picks the option named `option` of a relation picker, after typing `search` into its search box. */
export async function pick(
  page: Page,
  field: Locator,
  search: string,
  option: string,
): Promise<void> {
  await field.click();
  await page.getByRole('combobox').last().fill(search);
  await page.getByRole('option', { name: option }).first().click();
}

/** Creates a grant for `guest` at their door from the create page; answers its id. */
export async function createGrant(
  page: Page,
  guest: PersonAtDoor,
  grant: {
    readonly from: string;
    readonly until: string;
    readonly singleUse: boolean;
    readonly reason: string;
  },
): Promise<string> {
  const field = (name: string) => page.getByTestId(`form-field-input:access_grant:create:${name}`);
  await page.goto('/access-grants/create');
  await pick(page, field('profile_id'), guest.last, guest.name);
  await pick(page, field('access_point_id'), guest.doorName, guest.doorName);
  await field('valid_from').fill(grant.from);
  await field('valid_until').fill(grant.until);
  if (grant.singleUse) await field('single_use').check();
  await field('reason').fill(grant.reason);
  await page.getByTestId('form-submit:access_grant:create').click();
  await expect(page).toHaveURL(/\/access-grants\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop() ?? '';
}

/** The facility named `name` and the first of its areas by name (the override's area). */
export async function facilityWithArea(
  page: Page,
  name: string,
): Promise<{ readonly id: string; readonly areaName: string }> {
  const data = await graphqlAs<{ facilities: { id: string; areas: { name: string }[] }[] }>(
    page,
    'query ($n: String!) { facilities(where: { name: { _eq: $n } }) { id areas(order_by: { name: asc }, limit: 1) { name } } }',
    { n: name },
  );
  return { id: data.facilities[0]?.id ?? '', areaName: data.facilities[0]?.areas[0]?.name ?? '' };
}

/** The status of the policy version `id`, read as the page's member. */
export async function versionStatusOf(page: Page, id: string): Promise<string> {
  const data = await graphqlAs<{ access_policy_versions_by_pk: { status: string } }>(
    page,
    'query ($id: uuid!) { access_policy_versions_by_pk(id: $id) { status } }',
    { id },
  );
  return data.access_policy_versions_by_pk.status;
}

/** Waits until every terminal row's `data-state` is one of `states` (pushes land within a minute). */
export async function expectEveryState(rows: Locator, states: readonly string[]): Promise<void> {
  await expect
    .poll(async () => (await attributes(rows, 'state')).every((s) => states.includes(s ?? '')), {
      timeout: 60_000,
    })
    .toBe(true);
}

/**
 * Adds a row to a policy version's Who or Where tab: the `nth` Create button of the tab (one per
 * kind), then the option `option` of the dialog's picker `picker`; waits for the dialog to close.
 */
export async function addVersionRow(
  page: Page,
  tab: string,
  nth: number,
  picker: RegExp,
  search: string,
  option: string,
): Promise<Locator> {
  const main = page.getByRole('main');
  const dialog = page.getByRole('dialog');
  await main.getByRole('tab', { name: tab }).click();
  const panel = main.getByRole('tabpanel', { name: tab });
  await panel.getByRole('button', { name: 'Create' }).nth(nth).click();
  await pick(page, dialog.getByRole('combobox', { name: picker }), search, option);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return panel;
}

/** Starts an evacuation of `area` in `facility` from the overrides list; answers the override's id. */
export async function startEvacuation(
  page: Page,
  facility: string,
  area: string,
  justification: string,
): Promise<string> {
  const dialog = page.getByRole('dialog');
  await page.goto('/emergency-overrides');
  await page.getByRole('main').getByRole('button', { name: 'Start override', exact: true }).click();
  await pick(page, dialog.getByRole('combobox', { name: /^Facility/ }), facility, facility);
  await dialog.getByRole('combobox', { name: /^Mode/ }).click();
  await page.getByRole('option', { name: /^Evacuation\b/ }).click();
  await pick(page, dialog.getByRole('combobox', { name: /^Areas/ }), area, area);
  // A multi-pick stays open: close its list, not the dialog.
  await page.getByRole('combobox', { name: /^Search area/ }).press('Escape');
  await expect(dialog.getByRole('heading', { name: 'Start override' })).toBeVisible();
  await dialog.getByRole('textbox', { name: /^Ends/ }).fill(localInput(60));
  await dialog.getByRole('textbox', { name: /^Justification/ }).fill(justification);
  await dialog.getByRole('button', { name: 'Start override', exact: true }).click();
  await expect(page).toHaveURL(/\/emergency-overrides\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop() ?? '';
}
