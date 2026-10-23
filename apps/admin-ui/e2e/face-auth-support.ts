import { randomBytes, randomUUID } from 'node:crypto';
import { probeNear } from '../tests/support/auth-probe';
import { runSql } from './access-cleanup';

/** What `face-auth.spec.ts` wrote during a run, for {@link removeFaceAuthRun}. */
export interface FaceAuthRun {
  /** Run marker: applications are named `<run> …`. */
  readonly run: string;
  /** When the run began (ISO): file audit rows from then on are the run's. */
  readonly startedAt: string;
  readonly organizationId: string;
  readonly userId: string;
  /** The tester frames this run uploaded (ids from its `POST /v1/files` answers). */
  readonly frames: string[];
}

const quoted = (ids: Iterable<string>): string => [...ids].map((id) => `'${id}'`).join(', ') || 'null';

const ids = async (sql: string): Promise<string[]> => (await runSql(sql)).map(([id]) => id ?? '').filter((id) => id !== '');

/** Of the run's tester frames, those `authenticate_face` queued for deletion (reason `auth_tester_frame`). */
export async function queuedFrames(run: FaceAuthRun): Promise<string[]> {
  return ids(
    `select file_id from itap.pending_file_deletions where reason = 'auth_tester_frame'
       and organization_id = '${run.organizationId}' and file_id in (${quoted(run.frames)})`,
  );
}

/**
 * A pending partial match of `applicationId`, replayed through the seed-only `itap.seed_auth_flow`
 * (admin secret): a console session never recaptures, so it never pends. The probe sits at 0.56
 * against a population member's templates (below the 0.6 threshold, above the partial band).
 * Answers the pending attempt's id.
 */
export async function seedPendingPartial(run: FaceAuthRun, applicationId: string): Promise<string> {
  const [[member] = []] = await runSql(`select identity_id from itap.auth_population('${run.organizationId}', '${applicationId}', null, now()) limit 1`);
  if (member === undefined) throw new Error('the application has nobody to authenticate');
  const templates = (
    await runSql(`select embedding::text from itap.identity_embeddings where identity_id = '${member}' order by is_template desc, created_at`)
  ).map(([text]) => (text ?? '').replace(/[[\]\s]/gu, '').split(',').map(Number));
  const probe = `[${probeNear(templates, 0.56)
    .map((x) => x.toFixed(7))
    .join(',')}]`;
  const start = Date.now() - 10_000;
  const step = (i: number) => ({
    kind: 'decide',
    at: new Date(start + i * 1000).toISOString(),
    embedding: probe,
    quality: { model_version: 'w600k_mbf', pipeline_ms: 200 },
    attack: { outcome: 'passed', details: { binding: 'valid' }, sequence_digest: randomBytes(32).toString('hex') },
  });
  const flow = {
    kind: 'session',
    application_id: applicationId,
    session_id: randomUUID(),
    mode: 'identification',
    device_ref: 'e2e-kiosk',
    at: new Date(start).toISOString(),
    steps: [step(1), step(2), step(3)],
  };
  const rows = await runSql(
    `select id, review_status from itap.seed_auth_flow('{"x-hasura-organization-id": "${run.organizationId}"}'::json, '${JSON.stringify(flow)}'::jsonb)`,
  );
  const pending = rows.find(([, review]) => review === 'pending')?.[0];
  if (pending === undefined) throw new Error(`no pending partial match: ${JSON.stringify(rows)}`);
  return pending;
}

/**
 * Removes everything a run wrote, with the admin secret: the events of the run's attempts with what
 * they fanned out, sequence digests, attempts, sessions, the applications (bindings and keys
 * cascade), the audit rows of all of them (ids read first: a delete audits by id), the evidence
 * captures and the run's own tester frames (`deleteFile` runs the console's `delete_file` as the admin), and the
 * audit rows of those file deletions. Answers what is left (0 when clean).
 */
export async function removeFaceAuthRun(run: FaceAuthRun, deleteFile: (id: string) => Promise<void>): Promise<number> {
  const apps = await ids(`select id from itap.client_applications where organization_id = '${run.organizationId}' and name like '${run.run}%'`);
  const inApps = `application_id in (${quoted(apps)})`;
  const children = await ids(
    ['segments', 'facilities', 'access_points', 'modes', 'attributes', 'keys']
      .map((table) => `select id::text from itap.client_application_${table} where ${inApps}`)
      .join(' union all '),
  );
  const evidence = await ids(`select evidence_file_id from itap.authentication_attempts where ${inApps} and evidence_file_id is not null`);
  const attempts = `(select id from itap.authentication_attempts where ${inApps})`;
  const events = `(select id from itap.events where dedup_key in (select 'auth:' || id from itap.authentication_attempts where ${inApps}))`;
  const audited = quoted([...apps, ...children]);
  const appAudit = `itap.audit_log where entity like 'client_application%' and (entity_id in (${audited})${apps
    .map((app) => ` or changes::text like '%${app}%'`)
    .join('')})`;
  await runSql(
    [
      "select set_config('itap.retention_context', 'on', true)",
      `delete from itap.notification_deliveries where event_id in ${events}`,
      `delete from itap.user_notifications where event_id in ${events}`,
      `delete from itap.webhook_deliveries where event_id in ${events}`,
      `delete from itap.incident_events where event_id in ${events}`,
      `delete from itap.events where id in ${events}`,
      `delete from itap.audit_log where entity = 'authentication_attempts' and entity_id in ${attempts}`,
      `delete from itap.auth_sequence_digests where attempt_id in ${attempts}`,
      `delete from itap.authentication_attempts where ${inApps}`,
      `delete from itap.authentication_sessions where ${inApps}`,
      `delete from itap.client_applications where id in (${quoted(apps)})`,
      `delete from ${appAudit}`,
    ].join('; '),
  );
  const files = [...evidence, ...run.frames];
  for (const file of files) await deleteFile(file).catch(() => undefined);
  await runSql(
    [
      "select set_config('itap.retention_context', 'on', true)",
      `delete from itap.audit_log where entity = 'files' and entity_id in (${quoted(files)}) and occurred_at >= '${run.startedAt}'`,
    ].join('; '),
  );
  const [[left] = []] = await runSql(
    `select (select count(*) from itap.client_applications where organization_id = '${run.organizationId}' and name like '${run.run}%')
       + (select count(*) from itap.authentication_sessions where ${inApps})
       + (select count(*) from ${appAudit})
       + (select count(*) from storage.files where id in (${quoted(files)}))`,
  );
  return Number(left);
}
