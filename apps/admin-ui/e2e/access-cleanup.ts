import { DEV_GRAPHQL, devAdminSecret } from '../tests/support/dev-hosts';

/** What `access.spec.ts` wrote during a run, for {@link removeAccessRun}. */
export interface AccessRun {
  /** Run marker: policies are named `<run> …`. */
  readonly run: string;
  /** When the run began (ISO): the visitor's decisions from then on are the run's. */
  readonly startedAt: string;
  /** The organization's policy epoch when the run began: sync log rows of later epochs are the run's pushes. */
  readonly startEpoch: number;
  readonly facilityId: string;
  /** The visitor the run asked the engine about (`check_access` records a decision each time). */
  readonly visitor: string | undefined;
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

const organizationOf = (facilityId: string): string =>
  `(select organization_id from itap.facilities where id = '${facilityId}')`;

/** The policy epoch of the facility's organization now (read before the run changes anything). */
export async function policyEpoch(facilityId: string): Promise<number> {
  const [row] = await runSql(
    `select policy_epoch from itap.organization_settings where organization_id = ${organizationOf(facilityId)}`,
  );
  const epoch = Number(row?.[0]);
  if (!Number.isInteger(epoch)) throw new Error('the facility has no organization settings');
  return epoch;
}

/**
 * Removes everything a run wrote, with the admin secret: the visitor's decisions of the run and the
 * decisions the run's grants, overrides and policy versions made (and their events, with what those
 * fanned out), the override events, grants, overrides with their areas, policies (versions,
 * subjects and targets cascade), the audit rows of all of them and the sync log rows of the epochs
 * the run produced. Ids are read first: deleting a row writes an audit row keyed by it. The deletes
 * bump the policy epoch as retention changes, which audits the settings row in the same
 * transaction: exactly those rows go. The urgent push the deletes cause is waited for, so its log
 * rows go too.
 */
export async function removeAccessRun(run: AccessRun): Promise<void> {
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
  const visitor =
    run.visitor === undefined
      ? 'false'
      : `(decided_at >= '${run.startedAt}' and profile_id = '${run.visitor}')`;
  const decisions = `(select id from itap.access_decisions where ${visitor}
    or grant_id in (${quoted(run.grants)}) or override_id in (${quoted(run.overrides)})
    or policy_version_id in (${quoted(versions)}))`;
  const keys = [...run.overrides].flatMap((id) => [
    `override:${id}:started`,
    `override:${id}:ended`,
  ]);
  const events = `(select id from itap.events where access_decision_id in ${decisions} or dedup_key in (${quoted(keys)}))`;
  const audited = [
    ...policies,
    ...versions,
    ...children,
    ...run.grants,
    ...run.overrides,
    ...areas,
  ];
  const organization = organizationOf(run.facilityId);
  const syncs = `delete from itap.terminal_policy_syncs where organization_id = ${organization} and epoch > ${run.startEpoch}`;
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
      `delete from itap.audit_log where entity_id in (${quoted(audited)})`,
      // The epoch bumps of these deletes, audited on the settings row in this transaction.
      `delete from itap.audit_log where entity = 'organization_settings' and entity_id = ${organization}
        and user_id is null and occurred_at = now() and changes = '{"retention": true}'::jsonb`,
      syncs,
    ].join('; '),
  );
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  await runSql(syncs);
}
