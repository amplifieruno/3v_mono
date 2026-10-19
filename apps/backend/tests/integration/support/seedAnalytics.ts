import { expect } from 'vitest';
import { asAdmin, asOrgAdmin } from './clients.js';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded analytics (slice 7, task 5), shared by the seed test. */

const STATS_SNAPSHOT = (org: string, from: string, to: string) => `
  select 'h' as k, id::text, area_id::text, hour::text as b, unique_identities, entries, exits, dwell_seconds, peak_occupancy, null::int as v
    from itap.area_hourly_stats where organization_id = ${org} and hour >= ${from} and hour < ${to}
  union all
  select 'd', id::text, facility_id::text, day::text, unique_identities, visits, known_identities, dwell_seconds, peak_occupancy, peak_hour
    from itap.facility_daily_stats where organization_id = ${org} and day = (${from} at time zone 'Europe/Moscow')::date
  union all
  select 't', id::text, from_area_id::text || '>' || to_area_id::text, day::text, count, null, null, null, null, null
    from itap.area_transitions_daily where organization_id = ${org} and day = (${from} at time zone 'Europe/Moscow')::date
  order by 1, 2`;

/** Stats of one sampled replayed day are what re-aggregating it (range, then hour by hour) yields: same rows, same ids. */
async function expectStatsReproducible(org: string, orgId: string): Promise<void> {
  const [day] = await runSqlRows(
    `select to_char((((now() at time zone 'Europe/Moscow')::date - 7)::timestamp at time zone 'Europe/Moscow') at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as from_ts`,
  );
  const from = `'${day.from_ts}'::timestamptz`;
  const to = `(${from} + interval '1 day')`;
  const before = await runSqlRows(STATS_SNAPSHOT(org, from, to));
  expect(before.filter((r) => r.k === 'h').length).toBeGreaterThan(10);
  expect(before.filter((r) => r.k === 'd')).toHaveLength(1);
  await asAdmin().request(
    `mutation ($o: uuid!, $f: timestamptz!, $t: timestamptz!) { aggregate_stats_range(args: { p_organization: $o, p_from: $f, p_to: $t }) { hourly_rows } }`,
    { o: orgId, f: new Date(Date.parse(day.from_ts ?? '')).toISOString(), t: new Date(Date.parse(day.from_ts ?? '') + 86_400_000).toISOString() },
  );
  await runSqlRows(`select count(*) from generate_series(${from} + interval '1 hour', ${to}, interval '1 hour') h,
                      lateral itap.aggregate_stats('${orgId}', h) a`);
  expect(await runSqlRows(STATS_SNAPSHOT(org, from, to))).toEqual(before);
}

export async function expectSeededAnalytics(novaSlug: string, riversideSlug: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${novaSlug}')`;
  const [ids] = await runSqlRows(
    `select ${org}::text as org, (select id::text from auth.users where email = 'admin@itap.demo') as admin,
            (select id::text from auth.users where email = 'nova.admin@itap.demo') as nova_admin`,
  );
  const orgId = ids.org ?? '';
  await expectStatsReproducible(org, orgId);

  const [row] = await runSqlRows(
    `select (select count(*) from itap.events where organization_id = ${org} and event_type = 'abnormal_movement') as abnormal,
            (select count(*) from itap.events e join itap.profiles p on p.id = e.profile_id join itap.work_schedules w on w.id = p.work_schedule_id
              where e.organization_id = ${org} and e.event_type = 'after_hours' and w.name = 'Night Shift') as night_after_hours,
            (select count(*) from itap.tracking_sessions s join itap.profiles p on p.id = s.profile_id join itap.work_schedules w on w.id = p.work_schedule_id
              where s.organization_id = ${org} and w.name = 'Night Shift'
                and (s.started_at at time zone 'Europe/Moscow')::time between '21:30' and '23:59') as night_arrivals,
            (select count(*) from itap.report_templates where organization_id = ${org} and is_system) as templates,
            (select count(*) from itap.report_templates t join itap.organizations o on o.id = t.organization_id
              where o.slug = '${riversideSlug}' and t.is_system) as riverside_templates,
            (select count(*) from itap.area_hourly_stats s join itap.organizations o on o.id = s.organization_id
              where o.slug = '${riversideSlug}') as riverside_stats,
            (select string_agg(name || ':' || channel, ',' order by name) from itap.report_schedules where organization_id = ${org}) as schedules`,
  );
  expect(Number(row.abnormal)).toBeGreaterThanOrEqual(3);
  expect(Number(row.abnormal)).toBeLessThanOrEqual(20);
  expect(row.night_after_hours).toBe('0');
  expect(Number(row.night_arrivals)).toBeGreaterThan(20);
  expect(row).toMatchObject({ templates: '10', riverside_templates: '10', schedules: 'Daily incidents:in_app,Weekly occupancy:email' });
  expect(Number(row.riverside_stats)).toBeGreaterThan(0);

  // Reports: completed through the pipeline with a file in the organization bucket, back-dated with their event.
  const reports = await runSqlRows(
    `select r.status, r.schedule_id is not null as scheduled, r.error, r.generated_at < now() - interval '10 minutes' as past,
            f.bucket_id = r.organization_id::text and f.metadata ->> 'kind' = 'report' as file_ok,
            (select count(*) from itap.report_metrics m where m.report_id = r.id) as metrics,
            (select e.occurred_at = r.generated_at from itap.events e
              where e.organization_id = r.organization_id and e.dedup_key = 'report:' || r.id || ':report_generated') as event_dated,
            (select count(*) from itap.notification_deliveries d where d.report_id = r.id and d.created_at = r.generated_at) as deliveries
       from itap.reports r left join storage.files f on f.id = r.file_id
      where r.organization_id = ${org} and r.created_at < (select created_at from itap.organizations where id = ${org})`,
  );
  const completed = reports.filter((r) => r.status === 'completed');
  expect(completed.length).toBeGreaterThanOrEqual(8);
  for (const r of completed) expect(r).toMatchObject({ past: 't', file_ok: 't', event_dated: 't' });
  expect(completed.every((r) => Number(r.metrics) > 0)).toBe(true);
  expect(completed.filter((r) => r.scheduled === 't').every((r) => Number(r.deliveries) > 0)).toBe(true);
  const failed = reports.filter((r) => r.status === 'failed');
  expect(failed).toHaveLength(1);
  expect(failed[0].error).toMatch(/storage/);

  // Bulk jobs: a completed import, a partial one with row errors and a result file, a completed bulk search.
  const jobs = await runSqlRows(
    `select kind, status, succeeded, failed, skipped, result_file_id is not null as result,
            (select count(*) from itap.bulk_job_rows x where x.bulk_job_id = j.id and x.private_owner_id is not null) as private_rows
       from itap.bulk_jobs j where organization_id = ${org} order by created_at`,
  );
  expect(jobs.map((j) => `${j.kind}:${j.status}`)).toEqual(['profile_import:completed', 'profile_import:partial', 'bulk_search:completed']);
  expect(jobs[0]).toMatchObject({ succeeded: '8', failed: '0', result: 't', private_rows: '0' });
  expect(jobs[1]).toMatchObject({ succeeded: '3', failed: '3', skipped: '1', result: 't' });
  expect(jobs[2]).toMatchObject({ result: 't', private_rows: '3' });

  // Owner-only rows: the admin's searches, bulk search and private saved search, and the Nova admin's personal dashboard.
  const admin = asOrgAdmin(ids.admin ?? '', orgId);
  const other = asOrgAdmin(ids.nova_admin ?? '', orgId);
  const OWN = `query {
    search_requests_aggregate { aggregate { count } }
    bulk_jobs(order_by: { created_at: asc }) { kind }
    saved_searches(order_by: { name: asc }) { name last_search_request_id }
    dashboards(order_by: { name: asc }) { name }
  }`;
  type Own = {
    search_requests_aggregate: { aggregate: { count: number } };
    bulk_jobs: { kind: string }[];
    saved_searches: { name: string; last_search_request_id: string | null }[];
    dashboards: { name: string }[];
  };
  const mine = await admin.request<Own>(OWN);
  const theirs = await other.request<Own>(OWN);
  expect(mine.search_requests_aggregate.aggregate.count).toBeGreaterThanOrEqual(8);
  expect(mine.bulk_jobs.map((j) => j.kind)).toContain('bulk_search');
  expect(mine.saved_searches.map((s) => s.name)).toEqual(['Blacklisted person lookalikes', 'Unidentified faces']);
  expect(mine.saved_searches[0].last_search_request_id).not.toBeNull();
  expect(mine.dashboards.map((d) => d.name)).toEqual(['Security overview']);
  expect(theirs.search_requests_aggregate.aggregate.count).toBe(0);
  expect(theirs.bulk_jobs.map((j) => j.kind)).toEqual(['profile_import', 'profile_import']);
  expect(theirs.saved_searches.map((s) => s.name)).toEqual(['Unidentified faces']);
  expect(theirs.dashboards.map((d) => d.name)).toEqual(['Facility manager', 'Security overview']);

  // Attendance from the replay: mostly on time (the attendance report of last week).
  const [attendance] = await runSqlRows(
    `select max(m.value) filter (where m.metric_name = 'punctuality') as punctuality
       from itap.report_metrics m join itap.reports r on r.id = m.report_id
      where r.organization_id = ${org} and r.report_type = 'attendance' and m.dimension = '{}'`,
  );
  expect(Number(attendance.punctuality)).toBeGreaterThan(75);
  expect(Number(attendance.punctuality)).toBeLessThan(95);
}
