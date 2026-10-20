import { expect } from 'vitest';
import { decryptSecret, serverKeys } from '../../../src/auth-service/crypto.js';
import { capture, openSession, sequence, type Key } from './authRest.js';
import { testEnv } from './clients.js';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded face authentication service (slice 9, task 4), shared by the seed test. */

type Row = Record<string, string | null>;
const n = (row: Row, key: string): number => Number(row[key]);
const FAILURE_REASONS = [
  'attack_detected', 'below_threshold', 'blur', 'liveness_failed', 'low_quality', 'multiple_faces', 'no_face', 'not_in_population',
  'not_retrieved', 'poor_lighting', 'second_factor_failed',
];
/** Seeded history only (the seed test's live request comes later; the live hour is not seeded). */
const HISTORY = `a.attempted_at < now() - interval '1 hour'`;

async function expectOutcomes(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select string_agg(distinct outcome, ',' order by outcome) from itap.authentication_attempts a where a.organization_id = ${org}) as outcomes,
            (select string_agg(distinct failure_reason, ',' order by failure_reason) from itap.authentication_attempts a
              where a.organization_id = ${org} and failure_reason is not null) as reasons,
            (select string_agg(distinct attack_outcome, ',' order by attack_outcome) from itap.authentication_attempts a where a.organization_id = ${org}) as attacks,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org}
              and (attack_outcome in ('printed_photo', 'injection')) <> (failure_reason = 'attack_detected' and outcome = 'failure')) as attack_mixed,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org} and failure_reason = 'below_threshold'
              and attack_outcome = 'passed') as no_match_passed,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org} and attack_outcome = 'injection'
              and attack_details ? 'replay' and attack_details ->> 'replay_of_attempt_id' is not null) as replays`,
  );
  expect(row.outcomes).toBe('failure,partial_match,success');
  expect(row.reasons).toBe(FAILURE_REASONS.join(','));
  expect(row.attacks).toBe('injection,not_checked,passed,printed_photo');
  // Attacks are recorded apart from the match outcome: every attack is a failure attack_detected and vice versa;
  // a no-match keeps attack_outcome passed; a replayed sequence points at the attempt it replays.
  expect(n(row, 'attack_mixed')).toBe(0);
  expect(n(row, 'no_match_passed')).toBeGreaterThan(0);
  expect(n(row, 'replays')).toBeGreaterThanOrEqual(1);
}

async function expectSandbox(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `with sandbox as (select a.* from itap.authentication_attempts a join itap.client_applications c on c.id = a.application_id
                       where a.organization_id = ${org} and c.is_sandbox)
     select (select count(*) from sandbox) as attempts,
            (select count(*) from sandbox s join itap.identities i on i.id = s.matched_identity_id where not i.is_synthetic) as production_matches,
            (select count(*) from sandbox s join itap.identities i on i.id = s.claimed_identity_id
              where not i.is_synthetic and s.failure_reason is distinct from 'not_in_population') as production_claims_not_refused,
            (select count(*) from sandbox s join itap.identities i on i.id = s.claimed_identity_id where not i.is_synthetic) as production_claims,
            (select count(*) from sandbox s where not (s.population_scope ->> 'sandbox')::boolean) as production_scope,
            (select count(*) from itap.events e join sandbox s on s.id = e.authentication_attempt_id) as events,
            (select count(*) from itap.authentication_attempts a join itap.client_applications c on c.id = a.application_id
               join itap.identities i on i.id in (a.matched_identity_id, a.claimed_identity_id)
              where a.organization_id = ${org} and not c.is_sandbox and i.is_synthetic) as synthetic_in_production,
            (select count(*) from itap.identities i where i.organization_id = ${org} and i.is_synthetic and i.profile_id is null
              and exists (select 1 from itap.identity_centroids c where c.identity_id = i.id)) as synthetic`,
  );
  expect(n(row, 'attempts')).toBeGreaterThan(50);
  // A sandbox app never retrieves a production identity; claiming one is refused as outside the population.
  expect(n(row, 'production_matches')).toBe(0);
  expect(n(row, 'production_claims_not_refused')).toBe(0);
  expect(n(row, 'production_claims')).toBeGreaterThan(0);
  expect(n(row, 'production_scope')).toBe(0);
  expect(n(row, 'events')).toBe(0);
  expect(n(row, 'synthetic_in_production')).toBe(0);
  expect(n(row, 'synthetic')).toBeGreaterThanOrEqual(20);
}

async function expectReviewsAndSessions(org: string): Promise<void> {
  const [row] = await runSqlRows(
    `select (select string_agg(distinct review_status, ',' order by review_status) from itap.authentication_attempts a
              where a.organization_id = ${org}) as statuses,
            (select count(*) from itap.authentication_attempts a join auth.users u on u.id = a.reviewed_by
              where a.organization_id = ${org} and a.review_status in ('approved', 'rejected') and u.email <> 'nova.admin@itap.demo') as other_reviewer,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org} and a.review_status in ('approved', 'rejected')
              and not (a.reviewed_at > a.attempted_at and a.reviewed_at < now() - interval '1 hour')) as review_times,
            (select count(*) from itap.authentication_sessions s where s.organization_id = ${org} and s.status = 'review') as in_review,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org} and a.review_status = 'pending') as pending,
            (select count(*) from itap.authentication_sessions s
               join lateral (select min(attempted_at) as first, max(attempted_at) as last from itap.authentication_attempts a where a.session_id = s.id) x on true
               left join itap.client_application_keys k on k.id = s.key_id
              where s.organization_id = ${org} and s.created_at < now() - interval '1 hour'
                and (s.expires_at <> s.created_at + interval '5 minutes' or x.first < s.created_at or x.last > s.expires_at
                     or s.closed_at < s.created_at or s.key_id is null or k.created_at > s.created_at)) as inconsistent_sessions`,
  );
  expect(row.statuses).toBe('approved,none,pending,rejected');
  expect(n(row, 'other_reviewer')).toBe(0);
  expect(n(row, 'review_times')).toBe(0);
  expect(n(row, 'in_review')).toBe(n(row, 'pending'));
  expect(n(row, 'inconsistent_sessions')).toBe(0);
}

async function expectVolumeAndPlaces(org: string): Promise<void> {
  const days = await runSqlRows(
    `select (a.attempted_at at time zone 'Europe/Moscow')::date as day, extract(isodow from a.attempted_at at time zone 'Europe/Moscow') as dow,
            count(*) as n from itap.authentication_attempts a where a.organization_id = ${org} and ${HISTORY}
        -- Whole days only: not the first (partly older than 30 days) nor today.
        and a.attempted_at > now() - interval '29 days'
        and (a.attempted_at at time zone 'Europe/Moscow')::date < (now() at time zone 'Europe/Moscow')::date
      group by 1, 2`,
  );
  expect(days.length).toBeGreaterThanOrEqual(18);
  for (const d of days) {
    expect(Number(d.dow), String(d.day)).toBeLessThanOrEqual(5);
    expect(Number(d.n), String(d.day)).toBeGreaterThanOrEqual(10);
    expect(Number(d.n), String(d.day)).toBeLessThanOrEqual(60);
  }
  const [row] = await runSqlRows(
    `select (select count(*) from itap.authentication_attempts a join itap.client_applications c on c.id = a.application_id
              where a.organization_id = ${org} and c.name = 'Lobby Kiosk' and ${HISTORY} and a.population_size = 0) as lobby_empty,
            (select count(*) from itap.authentication_attempts a where a.organization_id = ${org} and a.evidence_file_id is not null) as evidence,
            (select count(*) from itap.authentication_attempts a join storage.files f on f.id = a.evidence_file_id
              where a.organization_id = ${org} and f.metadata ->> 'kind' = 'auth_capture' and a.outcome <> 'success') as evidence_ok`,
  );
  // Lobby attempts run inside the work schedules and the turnstile policy hours: the population is never empty.
  expect(n(row, 'lobby_empty')).toBe(0);
  expect(n(row, 'evidence')).toBeGreaterThanOrEqual(5);
  expect(n(row, 'evidence_ok')).toBe(n(row, 'evidence'));
}

async function expectKeys(org: string): Promise<void> {
  const keys = await runSqlRows(
    `select c.name, c.status,
            count(k.id) filter (where k.revoked_at is null and (k.expires_at is null or k.expires_at > now())) as active,
            count(k.id) filter (where k.revoked_at is not null) as revoked,
            count(k.id) filter (where k.expires_at <= now()) as expired,
            count(k.id) filter (where k.secret !~ '^v2:') as not_v2
       from itap.client_applications c left join itap.client_application_keys k on k.application_id = c.id
      where c.organization_id = ${org} group by c.name, c.status order by c.name`,
  );
  expect(keys.map((k) => [k.name, k.status, k.active, k.revoked, k.expired, k.not_v2])).toEqual([
    ['Developer Sandbox', 'active', '1', '1', '0', '0'],
    ['HR Portal', 'active', '1', '1', '0', '0'],
    ['Legacy Badge Kiosk', 'suspended', '0', '0', '0', '0'],
    ['Lobby Kiosk', 'active', '1', '1', '0', '0'],
    ['Visitor Check-in', 'active', '1', '1', '1', '0'],
  ]);
}

export async function expectSeededFaceAuth(slug: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${slug}')`;
  await expectOutcomes(org);
  await expectSandbox(org);
  await expectReviewsAndSessions(org);
  await expectVolumeAndPlaces(org);
  await expectKeys(org);
}

/**
 * The seeded Lobby Kiosk key authenticates: its stored secret (decrypted with the backend's AUTH_KEY_ENCRYPTION_KEY)
 * signs a real session and a real capture against the running service, which answers with a valid outcome.
 */
export async function expectSeededKeyAuthenticates(slug: string): Promise<void> {
  const [row] = await runSqlRows(
    `select k.key_prefix, k.secret, k.application_id, (select id from itap.access_points p where p.organization_id = c.organization_id
              and p.name = 'Turnstile 1') as turnstile
       from itap.client_application_keys k join itap.client_applications c on c.id = k.application_id
       join itap.organizations o on o.id = c.organization_id
      where o.slug = '${slug}' and c.name = 'Lobby Kiosk' and k.revoked_at is null`,
  );
  const hex = testEnv().AUTH_KEY_ENCRYPTION_KEY;
  expect(hex).toBeTruthy();
  const prefix = String(row.key_prefix);
  const secret = decryptSecret(serverKeys(String(hex)), row.secret, prefix);
  expect(secret).toBeTruthy();
  const key: Key = { key_id: '', application_id: String(row.application_id), prefix, secret: String(secret), expires_at: null };
  const session = await openSession(key, { mode: 'identification', access_point_id: row.turnstile, device_ref: 'lobby-kiosk-t1' });
  const reply = await capture(key, session, await sequence('high'));
  expect(reply.status).toBe(200);
  expect(['success', 'partial_match', 'failure']).toContain(reply.body.outcome);
}
