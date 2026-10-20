import { expect } from 'vitest';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded compliance data (slice 10, task 5), shared by the seed test. */

type Row = Record<string, string | null>;
const n = (row: Row, key: string): number => Number(row[key]);

function session(org: string): string {
  return `json_build_object('x-hasura-role', 'org_admin', 'x-hasura-organization-id', ${org})`;
}

/** Policies keep the history; a retention plan (dry run) right now and the seeded past runs purge nothing. */
async function expectRetention(org: string): Promise<void> {
  const [policies] = await runSqlRows(
    `select count(*) filter (where facility_id is null) as org_wide, count(*) filter (where facility_id is not null) as facility,
            count(distinct data_class) filter (where facility_id is null) as classes, min(retain_days) as min_days,
            (select count(*) from itap.retention_data_classes) as all_classes
       from itap.retention_policies where organization_id = ${org} and is_active`,
  );
  expect(n(policies, 'org_wide')).toBe(n(policies, 'all_classes'));
  expect(n(policies, 'classes')).toBe(n(policies, 'all_classes'));
  expect(n(policies, 'facility')).toBe(1);
  expect(n(policies, 'min_days')).toBeGreaterThanOrEqual(31);

  // The 30-day demo window stays intact: nothing is a candidate of any policy now.
  const plan = await runSqlRows(`select data_class, candidates from itap.retention_plan(${session(org)}, now())`);
  expect(plan.length).toBe(n(policies, 'org_wide') + 1);
  expect(plan.filter((p) => Number(p.candidates) > 0)).toEqual([]);

  const [runs] = await runSqlRows(
    `select count(*) as runs, count(*) filter (where r.status = 'completed') as completed,
            coalesce(sum((select sum(c.affected) from itap.retention_run_classes c where c.run_id = r.id)), 0) as affected,
            count(*) filter (where r.started_at < r.scheduled_at or r.started_at > r.scheduled_at + interval '1 minute') as not_backdated
       from itap.retention_runs r where r.organization_id = ${org} and not r.dry_run
        and r.scheduled_at between now() - interval '8 days' and now() - interval '12 hours'`,
  );
  expect(n(runs, 'runs')).toBeGreaterThanOrEqual(7);
  expect(n(runs, 'completed')).toBe(n(runs, 'runs'));
  expect(n(runs, 'affected')).toBe(0);
  expect(n(runs, 'not_backdated')).toBe(0);
}

async function expectGovernance(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select count(*) from itap.legal_holds h join itap.legal_hold_targets t on t.hold_id = h.id
              where h.organization_id = ${org} and t.incident_id is not null and h.starts_at < now() and h.ends_at is null) as incident_holds,
            (select count(*) from itap.legal_holds h join itap.legal_hold_targets t on t.hold_id = h.id
              where h.organization_id = ${org} and t.profile_id is not null and h.starts_at < now() and h.ends_at is null) as profile_holds,
            (select count(*) from itap.processing_activities where organization_id = ${org}) as activities,
            (select count(*) from itap.processing_activities a join storage.files f on f.id = a.dpia_file_id
              where a.organization_id = ${org} and f.metadata ->> 'kind' = 'dpia' and a.dpia_status = 'approved') as with_dpia,
            (select count(*) from itap.processing_activities a where a.organization_id = ${org}
              and not exists (select 1 from itap.processing_activity_data_classes c where c.activity_id = a.id)) as without_classes`,
  );
  expect(n(row, 'incident_holds')).toBe(1);
  expect(n(row, 'profile_holds')).toBe(1);
  expect(n(row, 'activities')).toBeGreaterThanOrEqual(4);
  expect(n(row, 'with_dpia')).toBeGreaterThanOrEqual(1);
  expect(n(row, 'without_classes')).toBe(0);
}

async function expectRequests(org: string): Promise<void> {
  const rows = await runSqlRows(
    `select r.request_type, r.status, r.partial::text, r.export_file_id is not null as has_file, r.due_at < now() as overdue,
            f.metadata ->> 'kind' as file_kind, p.erased_at is not null as erased, p.processing_restricted::text as restricted,
            (select count(*) from itap.identities i where i.profile_id = r.profile_id) as identities,
            (select count(*) from itap.events e where e.organization_id = r.organization_id and e.event_type = 'dsr_overdue'
              and e.payload ->> 'request_id' = r.id::text) as overdue_events
       from itap.data_subject_requests r join itap.profiles p on p.id = r.profile_id
       left join storage.files f on f.id = r.export_file_id
      where r.organization_id = ${org} order by r.number`,
  );
  const of = (type: string) => rows.filter((r) => r.request_type === type);
  expect(of('access')).toEqual([expect.objectContaining({ status: 'completed', has_file: 't', file_kind: 'dsr_export' })]);
  expect(of('restriction')).toEqual([expect.objectContaining({ status: 'completed', restricted: 'true', identities: '1' })]);
  // The erased subject is a tombstone without identities (hence without templates, photos or centroids).
  expect(of('erasure')).toEqual([expect.objectContaining({ status: 'completed', partial: 'false', erased: 't', identities: '0' })]);
  const rectifications = of('rectification');
  expect(rectifications.map((r) => [r.status, r.overdue])).toEqual([['in_progress', 'f'], ['in_progress', 't']]);
  expect(rectifications.map((r) => Number(r.overdue_events))).toEqual([0, 1]);
}

/** The erased subject left no biometric rows; the restricted subject's face is out of the match population. */
async function expectSubjects(org: string): Promise<void> {
  const [erased] = await runSqlRows(
    `select (select count(*) from itap.identity_embeddings e where e.organization_id = ${org}
               and e.identity_id not in (select id from itap.identities)) as orphan_templates,
            (select count(*) from itap.dsr_steps s join itap.data_subject_requests r on r.id = s.request_id
              where r.organization_id = ${org} and r.request_type = 'erasure' and s.step = 'completed') as erasure_done,
            (select count(*) from storage.files f where f.bucket_id = ${org}::text and f.name ilike '%novotny%') as files_named`,
  );
  expect(erased).toEqual({ orphan_templates: '0', erasure_done: '1', files_named: '0' });

  const [restricted] = await runSqlRows(
    `select e.identity_id, e.embedding::text as embedding from itap.identity_embeddings e
       join itap.identities i on i.id = e.identity_id join itap.profiles p on p.id = i.profile_id
      where p.organization_id = ${org} and p.processing_restricted and e.is_template limit 1`,
  );
  expect(restricted?.identity_id).toBeTruthy();
  const vector = `'${restricted.embedding}'`;
  const matches = await runSqlRows(`select identity_id from itap.match_face(${session(org)}, ${vector}, null, 5)`);
  expect(matches.map((m) => m.identity_id)).not.toContain(restricted.identity_id);
  const suppressed = await runSqlRows(`select similarity from itap.match_face_suppressed(${session(org)}, ${vector}, null)`);
  expect(Number(suppressed[0]?.similarity)).toBeGreaterThan(0.99);
}

async function expectIntegrations(org: string): Promise<void> {
  const rows = await runSqlRows(
    `select i.kind, i.status, count(r.id) as runs, count(*) filter (where r.status = 'succeeded') as ok,
            count(*) filter (where r.status = 'failed') as failed, coalesce(sum(r.created_count), 0) as created,
            coalesce(sum(r.updated_count), 0) as updated, coalesce(sum(r.deactivated_count), 0) as deactivated,
            count(*) filter (where r.fixture_file_id is not null) as with_fixture,
            (select count(*) from itap.events e where e.organization_id = i.organization_id and e.event_type = 'integration_failed'
              and e.payload ->> 'integration_id' = i.id::text) as failure_events,
            (select count(*) from itap.profiles p where p.source_integration_id = i.id) as profiles
       from itap.integrations i left join itap.integration_sync_runs r on r.integration_id = i.id
      where i.organization_id = ${org} group by i.id order by i.kind`,
  );
  const of = (kind: string) => rows.find((r) => r.kind === kind) ?? {};
  const hr = of('hr');
  expect(hr).toMatchObject({ status: 'active', failed: '0', failure_events: '0' });
  expect(n(hr, 'ok')).toBeGreaterThanOrEqual(3);
  expect(n(hr, 'with_fixture')).toBe(n(hr, 'runs'));
  for (const key of ['created', 'updated', 'deactivated']) expect(n(hr, key), key).toBeGreaterThan(0);
  expect(n(hr, 'profiles')).toBe(n(hr, 'created'));
  expect(of('siem')).toMatchObject({ status: 'active', failed: '0' });
  expect(n(of('siem'), 'ok')).toBeGreaterThanOrEqual(2);
  const bms = of('bms');
  expect(bms.status).toBe('error');
  expect(n(bms, 'failed')).toBeGreaterThanOrEqual(2);
  expect(n(bms, 'failure_events')).toBe(n(bms, 'failed'));
}

async function expectExports(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select count(*) from itap.export_definitions where organization_id = ${org}) as definitions,
            count(*) as jobs, count(*) filter (where j.status = 'completed' and f.metadata ->> 'kind' = 'export'
              and f.uploaded_by_user_id = j.requested_by) as with_file,
            count(*) filter (where j.watermark_from is not null) as continued
       from itap.export_jobs j left join storage.files f on f.id = j.file_id where j.organization_id = ${org}`,
  );
  expect(n(row, 'definitions')).toBeGreaterThanOrEqual(3);
  expect(n(row, 'jobs')).toBeGreaterThanOrEqual(4);
  expect(n(row, 'with_file')).toBe(n(row, 'jobs'));
  expect(n(row, 'continued')).toBeGreaterThanOrEqual(1);
}

export async function expectSeededCompliance(slug: string, otherSlug: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${slug}')`;
  await expectRetention(org);
  await expectGovernance(org);
  await expectRequests(org);
  await expectSubjects(org);
  await expectIntegrations(org);
  await expectExports(org);
  // Riverside: no policy (keep) and no compliance history.
  const other = `(select id from itap.organizations where slug = '${otherSlug}')`;
  const [riverside] = await runSqlRows(
    `select (select count(*) from itap.retention_policies where organization_id = ${other}) as policies,
            (select count(*) from itap.data_subject_requests where organization_id = ${other}) as requests`,
  );
  expect(riverside).toEqual({ policies: '0', requests: '0' });
}
