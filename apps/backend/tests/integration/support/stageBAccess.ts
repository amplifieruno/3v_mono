import type { HasuraClient } from '../../../src/hasura/client.js';
import { approveVersion, createPolicyWithDraft, submitVersion } from './access.js';
import { asOrgAdmin } from './clients.js';
import { addMember, createTestUser } from './fixtures.js';
import { insertOne, updateByPk } from './operations.js';
import { runSql, runSqlRows } from './sql.js';
import { at, createTrackingWorld } from './tracking.js';

/**
 * Physical access in Stage B (slice 8 task 3): the tracking world (createTrackingWorld) plus a second admin for
 * four-eyes approval. The entrance door (Lobby, bound to the entrance camera) is a face-credential door; the exit door
 * (bound to the exit camera) is not.
 */
export async function accessTrackingWorld() {
  const w = await createTrackingWorld();
  const approverUser = await createTestUser();
  await addMember(w.orgA.id, approverUser.id);
  const approver = asOrgAdmin(approverUser.id, w.orgA.id);
  await updateByPk(w.a, 'access_points', w.entranceDoor.id, { face_credential: true });
  return { ...w, approver };
}
export type AccessTrackingWorld = Awaited<ReturnType<typeof accessTrackingWorld>>;

/** Publishes (submit by a, approve by approver) a policy version with one subject and one target. */
export async function publishTrackingPolicy(
  w: { a: HasuraClient; approver: HasuraClient },
  subject: Record<string, unknown>,
  target: Record<string, unknown>,
  version: Record<string, unknown> = {},
): Promise<string> {
  const { draft } = await createPolicyWithDraft(w.a, subject, target, version);
  await submitVersion(w.a, draft.id);
  await approveVersion(w.approver, draft.id);
  return draft.id;
}

/** A profile with one linked identity. */
export async function person(
  a: HasuraClient,
  profile: Record<string, unknown> = {},
): Promise<{ profile: string; identity: string }> {
  const p = await insertOne(a, 'profiles', { first_name: 'Tess', last_name: 'Gate', ...profile });
  const i = await insertOne(a, 'identities', { profile_id: p.id });
  return { profile: p.id, identity: i.id };
}

/** A grant for the profile valid from `from` to `to` seconds of the test clock (area or access point in `extra`). */
export async function trackingGrant(
  a: HasuraClient,
  profile: string,
  extra: Record<string, unknown>,
  from = -3600,
  to = 3600,
): Promise<string> {
  const g = await insertOne(a, 'access_grants', {
    profile_id: profile,
    valid_from: at(from),
    valid_until: at(to),
    reason: 'Stage B test',
    ...extra,
  });
  return g.id;
}

export type StageDecision = {
  id: string;
  result: string;
  reason: string;
  identity_id: string | null;
  profile_id: string | null;
  device_id: string | null;
  access_point_id: string | null;
  detection_id: string | null;
  grant_id: string | null;
  decided_at: string;
};

/** Decisions of the organization, oldest first. */
export async function orgDecisions(org: string): Promise<StageDecision[]> {
  const rows = await runSqlRows(`select id, result, reason, identity_id, profile_id, device_id, access_point_id,
      detection_id, grant_id, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as decided_at
    from itap.access_decisions where organization_id = '${org}' order by decided_at, created_at`);
  const nul = (v: string | null): string | null => (v === 'NULL' ? null : v);
  return rows.map((r) => ({
    id: r.id ?? '',
    result: r.result ?? '',
    reason: r.reason ?? '',
    identity_id: nul(r.identity_id),
    profile_id: nul(r.profile_id),
    device_id: nul(r.device_id),
    access_point_id: nul(r.access_point_id),
    detection_id: nul(r.detection_id),
    grant_id: nul(r.grant_id),
    decided_at: r.decided_at ?? '',
  }));
}

export async function setSetting(org: string, column: string, value: number): Promise<void> {
  await runSql(`update itap.organization_settings set ${column} = ${value} where organization_id = '${org}'`);
}

/** itap.area_access_allowed(org, area, identity, profile, at) through run_sql: 'true' / 'false' / null (ungoverned). */
export async function areaAccessAllowed(
  org: string,
  area: string,
  identity: string | null,
  profile: string | null,
  seconds: number,
): Promise<boolean | null> {
  const lit = (v: string | null): string => (v ? `'${v}'::uuid` : 'null::uuid');
  const [row] = await runSqlRows(
    `select itap.area_access_allowed('${org}', '${area}', ${lit(identity)}, ${lit(profile)}, '${at(seconds)}') as r`,
  );
  return row.r === 'NULL' || row.r === null ? null : row.r === 't';
}
