import { expect } from 'vitest';
import { asOrgAdmin } from './clients.js';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded physical access (slice 8, task 5), shared by the seed test. */

/** Reasons the replayed history must contain (each produced by the real engine through Stage B). */
const EXPECTED_REASONS = [
  'grant', 'no_rule', 'outside_schedule', 'override_evacuation', 'policy_allow', 'policy_deny', 'profile_inactive',
  'risk_exceeded', 'unknown_person',
];

type Row = Record<string, string | null>;
const n = (row: Row, key: string): number => Number(row[key]);

async function expectPolicies(org: string, riverside: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select count(*) from itap.access_policies p join itap.access_policy_versions v on v.id = p.current_version_id
              where p.organization_id = ${org} and not p.is_archived and v.status = 'published') as enforced,
            (select count(*) from itap.access_policy_versions where organization_id = ${org} and status = 'pending_approval') as pending,
            (select count(*) from itap.access_policy_versions where organization_id = ${org} and status = 'draft' and submitted_at is null) as drafts,
            (select count(*) from itap.access_policy_versions where organization_id = ${org} and approved_by is not null
              and approved_by = submitted_by) as same_approver,
            (select count(*) from itap.access_policy_versions where organization_id = ${org} and status = 'published'
              and (approved_by is null or submitted_by is null)) as unapproved,
            (select count(*) from itap.access_policy_versions v join auth.users u on u.id = v.submitted_by
              where v.organization_id = ${org} and v.status = 'pending_approval' and u.email = 'nova.admin@itap.demo') as pending_by_second_admin,
            (select count(*) from itap.access_policy_versions where organization_id = ${org} and status = 'published'
              and valid_from > (select min(decided_at) from itap.access_decisions where organization_id = ${org})) as late_validity,
            (select count(*) from itap.access_policies p join itap.access_policy_versions v on v.id = p.current_version_id
              where p.organization_id = ${riverside} and v.status = 'published' and v.approved_by <> v.submitted_by) as riverside,
            (select string_agg(a.name, ',' order by a.name) from itap.access_points a
              where a.organization_id = ${org} and a.face_credential) as face_doors`,
  );
  expect(row).toMatchObject({
    enforced: '6',
    pending: '1',
    drafts: '1',
    same_approver: '0',
    unapproved: '0',
    pending_by_second_admin: '1',
    late_validity: '0',
    riverside: '1',
    face_doors: 'Server Room Door,Turnstile 1,Turnstile 2,Turnstile 3,Turnstile 4',
  });
}

async function expectDecisions(org: string): Promise<void> {
  const reasons = await runSqlRows(
    `select reason, result, count(*) as n from itap.access_decisions where organization_id = ${org} group by reason, result order by reason`,
  );
  const byReason = Object.fromEntries(reasons.map((r) => [r.reason ?? '', Number(r.n)]));
  for (const reason of EXPECTED_REASONS) expect(byReason[reason] ?? 0, reason).toBeGreaterThanOrEqual(1);
  expect(new Set(reasons.map((r) => r.result))).toEqual(new Set(['granted', 'denied']));

  const [row] = await runSqlRows(
    `select count(*) as total,
            count(*) filter (where d.detection_id is null) as without_detection,
            count(*) filter (where not a.face_credential) as other_doors,
            count(*) filter (where d.decided_at > now() - interval '1 hour') as recent,
            count(*) filter (where d.result = 'granted') as granted,
            (select count(*) from itap.events e where e.organization_id = ${org} and e.event_type in ('access_granted', 'access_denied')) as events,
            (select count(*) from itap.access_grants g where g.organization_id = ${org} and g.single_use and g.used_at is not null
               and exists (select 1 from itap.access_decisions x where x.grant_id = g.id)) as single_used,
            (select count(*) from itap.access_grants g where g.organization_id = ${org} and g.revoked_at is not null) as revoked,
            (select count(*) from itap.access_grants g where g.organization_id = ${org}) as grants
       from itap.access_decisions d join itap.access_points a on a.id = d.access_point_id
      where d.organization_id = ${org}`,
  );
  expect(n(row, 'total')).toBeGreaterThan(3_000);
  expect(row).toMatchObject({ without_detection: '0', other_doors: '0', recent: '0', single_used: '1', revoked: '1' });
  expect(n(row, 'granted')).toBeGreaterThan(n(row, 'total') * 0.9);
  expect(n(row, 'events')).toBe(n(row, 'total'));
  expect(n(row, 'grants')).toBeGreaterThan(5);
}

async function expectEvents(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select count(*) from itap.events where organization_id = ${org} and event_type = 'tailgating') as tailgating,
            (select max(c) from (select count(*) as c from itap.events where organization_id = ${org}
              and event_type = 'restricted_area_entry' group by (occurred_at at time zone 'Europe/Moscow')::date) x) as restricted_per_day,
            (select count(*) from itap.events where organization_id = ${org} and event_type = 'restricted_area_entry') as restricted,
            (select count(*) from itap.emergency_overrides o where o.organization_id = ${org} and o.mode = 'evacuation'
              and o.ended_at - o.started_at = interval '20 minutes' and o.started_at < now() - interval '1 day'
              and not exists (select 1 from itap.emergency_override_areas x where x.override_id = o.id)) as drills,
            (select count(*) from itap.events e join itap.emergency_overrides o on o.id = (e.payload ->> 'override_id')::uuid
              where e.organization_id = ${org} and e.event_type = 'emergency_override_started' and e.occurred_at = o.started_at) as started,
            (select count(*) from itap.events e join itap.emergency_overrides o on o.id = (e.payload ->> 'override_id')::uuid
              where e.organization_id = ${org} and e.event_type = 'emergency_override_ended' and e.occurred_at = o.ended_at) as ended,
            (select count(*) from itap.notification_deliveries d join itap.events e on e.id = d.event_id
              join itap.notification_rules r on r.id = d.rule_id
              where d.organization_id = ${org} and e.event_type like 'emergency_override_%' and r.name = 'Emergency overrides'
                and d.created_at < now() - interval '1 day') as override_deliveries,
            (select count(*) from itap.notification_deliveries d join itap.events e on e.id = d.event_id
              join itap.notification_rules r on r.id = d.rule_id
              where d.organization_id = ${org} and e.event_type = 'tailgating' and r.name = 'Tailgating') as tailgating_deliveries`,
  );
  expect(n(row, 'tailgating')).toBeGreaterThanOrEqual(1);
  expect(n(row, 'tailgating')).toBeLessThanOrEqual(5);
  // Policies govern only the areas their allow versions cover: no flood of restricted_area_entry.
  expect(n(row, 'restricted_per_day')).toBeLessThanOrEqual(3);
  expect(n(row, 'restricted')).toBeLessThanOrEqual(12);
  expect(row).toMatchObject({ drills: '1', started: '1', ended: '1' });
  expect(n(row, 'override_deliveries')).toBeGreaterThanOrEqual(2);
  // Tailgating reaches the security team inbox (rule "Tailgating").
  expect(n(row, 'tailgating_deliveries')).toBeGreaterThanOrEqual(1);
}

async function expectTerminals(org: string): Promise<void> {
  const [ids] = await runSqlRows(
    `select ${org} as org, (select id from auth.users where email = 'admin@itap.demo') as admin`,
  );
  const status = await asOrgAdmin(ids.admin ?? '', ids.org ?? '').request<{
    terminal_sync_status: { device_name: string; reachable: boolean; within_bound: boolean; sync_error: string | null; synced_epoch: number | null }[];
  }>(`query { terminal_sync_status { device_name reachable within_bound sync_error synced_epoch } }`);
  const rows = status.terminal_sync_status;
  const offline = rows.filter((t) => !t.reachable);
  expect(offline.map((t) => t.device_name)).toEqual(['Turnstile Terminal 4']);
  expect(offline[0]).toMatchObject({ within_bound: false });
  expect(offline[0]?.sync_error).toBeTruthy();
  const online = rows.filter((t) => t.reachable);
  expect(online.length).toBeGreaterThanOrEqual(8);
  for (const t of online) expect(t, t.device_name).toMatchObject({ within_bound: true });
  expect(online.every((t) => t.synced_epoch !== null)).toBe(true);
}

export async function expectSeededAccess(nova: string, riverside: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${nova}')`;
  const other = `(select id from itap.organizations where slug = '${riverside}')`;
  await expectPolicies(org, other);
  await expectDecisions(org);
  await expectEvents(org);
  await expectTerminals(org);
}
