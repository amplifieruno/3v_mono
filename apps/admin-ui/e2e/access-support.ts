import { type Browser, type Locator, type Page, expect } from '@playwright/test';
import {
  DEV_GRAPHQL,
  NOVA_ADMIN_EMAIL,
  devAdminSecret,
  seedPassword,
} from '../tests/support/dev-hosts';

/** What `access.spec.ts` wrote during a run, for {@link removeAccessRun}. */
export interface AccessRun {
  /** Run marker: policies are named `<run> …`. */
  readonly run: string;
  /** When the run began (ISO): decisions and sync log rows from then on are the run's. */
  readonly startedAt: string;
  readonly facilityId: string;
  /** The people the run asked the engine about: their decisions since `startedAt` are removed. */
  readonly people: readonly string[];
  readonly policies: ReadonlySet<string>;
  readonly grants: ReadonlySet<string>;
  readonly overrides: ReadonlySet<string>;
}

/** Runs SQL with the admin secret: test cleanup only (versions, decisions and audit rows are history to `org_admin`). */
export async function runSql(sql: string): Promise<string[][]> {
  const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  const body = (await response.json()) as { result?: string[][]; error?: string };
  if (!response.ok) throw new Error(`run_sql: ${JSON.stringify(body)}`);
  return (body.result ?? []).slice(1);
}

const quoted = (ids: Iterable<string>): string =>
  [...ids].map((id) => `'${id}'`).join(', ') || 'null';

const ids = async (sql: string): Promise<string[]> =>
  (await runSql(sql)).map(([id]) => id ?? '').filter((id) => id !== '');

/**
 * Removes everything a run wrote, with the admin secret: the decisions it recorded and their events
 * (and what those fanned out), the override events, grants, overrides with their areas, policies
 * (versions, subjects and targets cascade), the facility's sync log rows of the run and the audit
 * rows of all of them. Ids are read first: deleting a row writes an audit row keyed by it. The
 * deletes change the rule set, so the urgent push they cause is waited for and its log rows go too,
 * with the settings row's audit rows of those epoch bumps.
 */
export async function removeAccessRun(run: AccessRun): Promise<void> {
  const decisions = `(select id from itap.access_decisions where decided_at >= '${run.startedAt}' and profile_id in (${quoted(run.people)}))`;
  const keys = [...run.overrides].flatMap((id) => [
    `override:${id}:started`,
    `override:${id}:ended`,
  ]);
  const events = `(select id from itap.events where access_decision_id in ${decisions} or dedup_key in (${quoted(keys)}))`;
  const policies = await ids(
    `select id from itap.access_policies where id in (${quoted(run.policies)}) or name like '${run.run}%'`,
  );
  const versions = await ids(
    `select id from itap.access_policy_versions where policy_id in (${quoted(policies)})`,
  );
  const children = await ids(
    `select id from itap.access_policy_version_subjects where version_id in (${quoted(versions)})
     union all select id from itap.access_policy_version_targets where version_id in (${quoted(versions)})`,
  );
  const areas = await ids(
    `select id from itap.emergency_override_areas where override_id in (${quoted(run.overrides)})`,
  );
  const audited = [
    ...policies,
    ...versions,
    ...children,
    ...run.grants,
    ...run.overrides,
    ...areas,
  ];
  const syncs = `delete from itap.terminal_policy_syncs where facility_id = '${run.facilityId}' and created_at >= '${run.startedAt}'`;
  await runSql(
    [
      "select set_config('itap.retention_context', 'on', true)",
      `delete from itap.notification_deliveries where event_id in ${events}`,
      `delete from itap.user_notifications where event_id in ${events}`,
      `delete from itap.webhook_deliveries where event_id in ${events}`,
      `delete from itap.incident_events where event_id in ${events}`,
      `delete from itap.events where id in ${events}`,
      `delete from itap.access_decisions where id in ${decisions}`,
      `delete from itap.access_grants where id in (${quoted(run.grants)})`,
      `delete from itap.emergency_override_areas where override_id in (${quoted(run.overrides)})`,
      `delete from itap.emergency_overrides where id in (${quoted(run.overrides)})`,
      `delete from itap.access_policies where id in (${quoted(policies)})`,
      syncs,
      `delete from itap.audit_log where entity_id in (${quoted(audited)})`,
    ].join('; '),
  );
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  // The epoch bumps of these deletes are audited on the settings row as retention changes.
  await runSql(
    `select set_config('itap.retention_context', 'on', true); ${syncs}; delete from itap.audit_log where entity = 'organization_settings' and occurred_at >= '${run.startedAt}' and changes = '{"retention": true}'::jsonb`,
  );
}

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
 * (`check_access` records a decision each time: the run's cleanup removes them by person and time).
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
