import { expect } from 'vitest';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded segments (slice 6, task 4), shared by the seed test. */

const NOVA_SEGMENTS = [
  // Slice 9: Employees / Visitors (face authentication populations) and the sandbox's synthetic identities.
  'Contractors ending soon', 'Employees', 'Executive floor access', 'Floor 12 fit-out crew', 'Frequent visitors',
  // Slice 8: the manual server room list an access policy allows (written before the replay).
  'IT and server room staff', 'Night shift', 'Parking permit holders', 'Sandbox test identities', 'Unknown frequent faces', 'VIP',
  'Visitors', 'Weekend presence',
].join(',');

/** Membership invariants that hold for every organization (Review Focus 1, 2). */
export async function expectSegmentInvariants(slug: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${slug}')`;
  const members = `(select m.*, coalesce(m.identity_id, m.profile_id) as subject from itap.segment_members m where m.organization_id = ${org})`;
  const [row] = await runSqlRows(
    `select (select count(*) from ${members} a join ${members} b on b.segment_id = a.segment_id and b.subject = a.subject and b.id <> a.id
               and a.added_at < coalesce(b.removed_at, 'infinity') and b.added_at < coalesce(a.removed_at, 'infinity')) as overlapping,
            (select count(*) from (select 1 from ${members} m where m.removed_at is null group by m.segment_id, m.subject having count(*) > 1) x) as duplicate_open,
            (select count(*) from itap.segments s where s.organization_id = ${org}
               and s.member_count <> (select count(*) from itap.segment_members m where m.segment_id = s.id and m.removed_at is null)) as wrong_count,
            (select count(*) from ${members} m where m.source = 'manual' and (m.added_by is null or (m.removed_at is not null and m.removed_by is null))) as manual_without_actor,
            (select count(*) from ${members} m where m.source = 'rule' and (m.added_by is not null or m.removed_by is not null)) as rule_with_actor,
            (select count(*) from ${members} m join itap.segments s on s.id = m.segment_id where s.kind = 'manual' and m.source = 'rule') as rule_on_manual`,
  );
  expect(row).toEqual({ overlapping: '0', duplicate_open: '0', wrong_count: '0', manual_without_actor: '0', rule_with_actor: '0', rule_on_manual: '0' });

  // Daily stats agree with the membership rows: member_count = rows open at the day's end (org-local), and the
  // day-to-day change = added - removed. Finished days only (the hourly cron keeps today's row current).
  const [stats] = await runSqlRows(
    `with tz as (select timezone from itap.organizations where id = ${org}),
     d as (select d.*, ((d.day + 1)::timestamp at time zone (select timezone from tz)) - interval '1 microsecond' as day_end,
                  lag(d.member_count) over (partition by d.segment_id order by d.day) as previous,
                  lag(d.day) over (partition by d.segment_id order by d.day) as previous_day
             from itap.segment_daily_stats d where d.organization_id = ${org}
              and d.day < (now() at time zone (select timezone from tz))::date)
     select count(*) as days,
            count(*) filter (where d.member_count <> (select count(*) from itap.segment_members m where m.segment_id = d.segment_id
               and m.added_at <= d.day_end and (m.removed_at is null or m.removed_at > d.day_end))) as wrong_member_count,
            count(*) filter (where d.previous is not null and d.previous_day = d.day - 1
               and d.member_count - d.previous <> d.added - d.removed) as wrong_churn
       from d`,
  );
  expect({ wrong_member_count: stats.wrong_member_count, wrong_churn: stats.wrong_churn }).toEqual({ wrong_member_count: '0', wrong_churn: '0' });
}

export async function expectSeededSegments(nova: string, riverside: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${nova}')`;
  const [config] = await runSqlRows(
    `select (select string_agg(name, ',' order by name) from itap.segments where organization_id = ${org}) as segments,
            (select string_agg(distinct target, ',') from itap.segments where organization_id = ${org}) as targets,
            (select count(*) from itap.segment_templates where organization_id = ${org} and is_system) as system_templates,
            (select string_agg(distinct target, ',') from itap.segment_templates where organization_id = ${org}) as template_targets,
            (select count(*) from itap.segments where organization_id = ${org} and template_id is not null) as from_template,
            (select string_agg(name, ',') from itap.segments where organization_id = ${org} and status = 'inactive') as inactive,
            (select count(*) from itap.segment_members m join itap.segments s on s.id = m.segment_id
               where s.organization_id = ${org} and s.status = 'inactive') as inactive_rows,
            (select count(*) from itap.segments where organization_id = ${org} and active_from is not null and active_until > now()) as windowed,
            (select count(*) from itap.segments where organization_id = ${org} and schedule is not null) as scheduled,
            (select count(*) from itap.segments where organization_id = ${org} and kind = 'dynamic' and status = 'active'
               and last_evaluated_at is null) as never_evaluated,
            (select count(*) from itap.segments where organization_id = ${org} and created_at > now() - interval '30 days') as recent`,
  );
  expect(config).toMatchObject({
    segments: NOVA_SEGMENTS,
    targets: 'identities,profiles',
    system_templates: '7',
    template_targets: 'identities,profiles',
    from_template: '3',
    inactive: 'Parking permit holders',
    inactive_rows: '0',
    windowed: '1',
    scheduled: '1',
    never_evaluated: '0',
    recent: '0',
  });

  const counts = await runSqlRows(
    `select s.name, count(m.id) as rows, count(m.id) filter (where m.source = 'manual') as manual,
            count(m.id) filter (where m.removed_at is not null) as closed,
            count(m.id) filter (where m.added_at < now() - interval '7 days') as old,
            (select count(*) from itap.segment_daily_stats d where d.segment_id = s.id) as days
       from itap.segments s left join itap.segment_members m on m.segment_id = s.id
      where s.organization_id = ${org} group by s.id, s.name`,
  );
  const by = Object.fromEntries(counts.map((c) => [c.name ?? '', c]));
  // Manual list: 3 VIPs + the security chief + 2 assistants (one removed by the admin).
  expect(by['Executive floor access']).toMatchObject({ rows: '6', manual: '6', closed: '1' });
  expect(by['Frequent visitors']).toMatchObject({ manual: '1' });
  for (const name of ['Night shift', 'VIP', 'Contractors ending soon', 'Unknown frequent faces', 'Frequent visitors', 'Floor 12 fit-out crew']) {
    expect(Number(by[name]?.rows), name).toBeGreaterThan(0);
  }
  // 30 days of history: daily stats from the configuration day on, memberships back-dated, weekly churn.
  for (const c of counts) expect(Number(c.days), c.name ?? '').toBeGreaterThanOrEqual(31);
  expect(Number(by['Frequent visitors']?.old)).toBeGreaterThan(0);
  expect(Number(by['Weekend presence']?.closed)).toBeGreaterThan(5);

  // Weekend presence has members on Saturday/Sunday days only.
  const [weekend] = await runSqlRows(
    `select count(*) filter (where extract(isodow from d.day) < 6 and d.member_count > 0) as weekday_members,
            count(*) filter (where extract(isodow from d.day) = 6 and d.member_count > 0) as saturdays
       from itap.segment_daily_stats d join itap.segments s on s.id = d.segment_id
      where s.organization_id = ${org} and s.name = 'Weekend presence'`,
  );
  expect(weekend.weekday_members).toBe('0');
  expect(Number(weekend.saturdays)).toBeGreaterThanOrEqual(3);

  // The segment-scoped event rule and the segment-conditioned notification rule, effective live.
  const [rules] = await runSqlRows(
    `select (select count(*) from itap.event_rule_version_scopes sc join itap.event_rules r on r.current_version_id = sc.version_id
               join itap.segments s on s.id = sc.segment_id
               where r.organization_id = ${org} and r.name = 'Fit-out crew after hours' and s.name = 'Floor 12 fit-out crew') as scoped,
            (select count(*) from itap.notification_rules n join itap.segments s on s.id = (n.conditions ->> 'segment_id')::uuid
               where n.organization_id = ${org} and n.is_active and s.name = 'Executive floor access') as conditioned`,
  );
  expect(rules).toEqual({ scoped: '1', conditioned: '1' });

  const other = `(select id from itap.organizations where slug = '${riverside}')`;
  const [small] = await runSqlRows(
    `select (select string_agg(name, ',') from itap.segments where organization_id = ${other}) as segments,
            (select member_count from itap.segments where organization_id = ${other}) as members,
            (select count(*) from itap.segment_templates where organization_id = ${other} and is_system) as system_templates`,
  );
  expect(small).toMatchObject({ segments: 'Security staff', system_templates: '7' });
  expect(Number(small.members)).toBeGreaterThan(0);
  await expectSegmentInvariants(nova);
  await expectSegmentInvariants(riverside);
}
