import { SCHEDULES } from './companies.js';
import type { SeedPeopleResult } from './people.js';
import type { HistoryHost, HistoryInput, HistoryPerson, HistoryVisitor } from './historyPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * The tracked people of the Nova Tower history. Only the manifest faces have enrolled identities; every other
 * profile that is tracked on camera (a granted biometric consent; employees and security, VIPs, contractors,
 * visitors) gets one primary identity of source `import` (access-control import, no face templates; the profile's
 * has_face is true, it counts linked identities), so the history covers the whole building. Every 12th employee
 * stays without an identity (pending link). Night-shift staff work 22:00-06:00 (Stage B does not report rostered staff
 * as after-hours presence; night guards check the loading dock). Unknown faces are the seeded camera identities
 * without a profile. One contractor's contract was
 * terminated before the replay window (terminateContractor).
 */
type ProfileRow = {
  id: string;
  external_id: string;
  profile_type: string;
  status: string;
  access_level: string;
  start_date: string | null;
  end_date: string | null;
  custom_fields: Record<string, unknown>;
  department: string | null;
  company: { id: string; name: string } | null;
  work_schedule: { name: string } | null;
  consent_records: { status: string }[];
  identities: { id: string; is_primary_for_profile: boolean; matching_enabled: boolean }[];
};

const PROFILES = `
  query SeedHistoryProfiles($org: uuid!) {
    profiles(where: { organization_id: { _eq: $org }, external_id: { _like: "seed:%" } }, order_by: { external_id: asc }) {
      id external_id profile_type status access_level start_date end_date custom_fields department
      company { id name }
      work_schedule { name }
      consent_records(where: { purpose: { _eq: biometric_processing } }, order_by: { granted_at: desc }, limit: 1) { status }
      identities(where: { status: { _nin: [merged, archived] } }, order_by: { number: asc }) {
        id is_primary_for_profile matching_enabled
      }
    }
  }
`;
const UNKNOWN = `
  query SeedHistoryUnknown($org: uuid!) {
    identities(
      where: { organization_id: { _eq: $org }, profile_id: { _is_null: true }, source: { _eq: camera },
               status: { _in: [unverified, pending_verification] } }
      order_by: { number: asc }
    ) { id }
  }
`;
const TERMINATE = `
  mutation SeedTerminateContractor($id: uuid!, $end: date!) {
    update_profiles_by_pk(pk_columns: { id: $id }, _set: { status: terminated, end_date: $end }) { id }
  }
`;
const INSERT_IDENTITIES = `
  mutation SeedHistoryIdentities($objects: [identities_insert_input!]!) {
    insert_identities(objects: $objects) { returning { id profile_id } }
  }
`;

export type HistoryPeople = Omit<HistoryInput, 'now' | 'timezone' | 'terminatedIdentity'> & {
  /** The contractor terminated before the replay window (seen once in the history), when there is one. */
  terminatedIdentity: string | null;
  /** Identity of every tracked profile (profile id -> identity id). */
  identityByProfile: Record<string, string>;
  /** Tenant company name of every tracked employee (estimated locations on their floor). */
  companyByIdentity: Record<string, string>;
};

const LOGISTICS = 'Granite Logistics';

function tracked(p: ProfileRow, blacklisted: Set<string>): boolean {
  if (blacklisted.has(p.id)) return false;
  return p.consent_records[0]?.status === 'granted';
}

/**
 * Every 12th employee (by seed key) keeps no identity at all: has_face stays false and the profile shows the
 * "pending link" state (FS) until a face is enrolled. Profiles with an enrolled face keep theirs.
 */
function leftUnlinked(p: ProfileRow): boolean {
  return p.profile_type === 'employee' && Number(p.external_id.slice('seed:'.length)) % 12 === 0;
}

const DAY_MS = 86_400_000;

/**
 * One tracked contractor (granted consent, started at least 60 days ago; the last by seed key) had the contract
 * terminated 40 days ago: status terminated, end_date then. Idempotent: an already terminated one is kept.
 */
async function terminateContractor(ctx: SeedContext, profiles: ProfileRow[], blacklisted: Set<string>): Promise<string | null> {
  const contractors = profiles.filter((p) => p.profile_type === 'contractor' && tracked(p, blacklisted));
  const done = contractors.find((p) => p.status === 'terminated');
  if (done) return done.id;
  const end = new Date(ctx.now.getTime() - 40 * DAY_MS).toISOString().slice(0, 10);
  const startedBy = new Date(ctx.now.getTime() - 60 * DAY_MS).toISOString().slice(0, 10);
  const pick = contractors.filter((p) => p.status === 'active' && p.start_date !== null && p.start_date <= startedBy).pop();
  if (!pick) return null;
  await ctx.admin.request(TERMINATE, { id: pick.id, end });
  return pick.id;
}

/** Loads the Nova Tower people, creates the missing history identities and returns the plan input. */
export async function historyPeople(
  ctx: SeedContext,
  org: string,
  people: SeedPeopleResult,
  seededIdentities: string[],
): Promise<HistoryPeople> {
  const load = async () => (await ctx.admin.request<{ profiles: ProfileRow[] }>(PROFILES, { org })).profiles;
  const blacklisted = new Set(people.byRole.blacklisted);
  let profiles = await load();
  const terminatedProfile = await terminateContractor(ctx, profiles, blacklisted);
  if (profiles.some((p) => p.id === terminatedProfile && p.status !== 'terminated')) profiles = await load();
  const missing = profiles.filter((p) => tracked(p, blacklisted) && !leftUnlinked(p) && p.identities.length === 0);
  if (missing.length > 0) {
    await ctx.admin.request(INSERT_IDENTITIES, {
      objects: missing.map((p) => ({
        organization_id: org,
        profile_id: p.id,
        is_primary_for_profile: true,
        source: 'import',
        attributes: { origin: 'access_control_import' },
      })),
    });
    profiles = await load();
  }

  const identityByProfile: Record<string, string> = {};
  const companyByIdentity: Record<string, string> = {};
  const persons: HistoryPerson[] = [];
  const visitors: HistoryVisitor[] = [];
  const hosts: HistoryHost[] = [];
  let securityIndex = 0;
  for (const p of profiles) {
    const identity = p.identities.find((i) => i.is_primary_for_profile) ?? p.identities[0];
    const usable = identity && identity.matching_enabled && tracked(p, blacklisted) ? identity.id : null;
    if (usable) identityByProfile[p.id] = usable;
    if (p.profile_type === 'visitor') {
      if (!blacklisted.has(p.id) && p.start_date) visitors.push({ profileId: p.id, identityId: usable, visitDate: p.start_date });
      continue;
    }
    const night = p.work_schedule?.name === SCHEDULES.nightShift;
    const security = p.work_schedule?.name === SCHEDULES.security || (night && p.department === 'Security');
    if (p.profile_type === 'employee' && !security && p.company) hosts.push({ profileId: p.id, companyId: p.company.id });
    if (!usable) continue;
    if (p.company && !security) companyByIdentity[usable] = p.company.name;
    const guard = security ? (securityIndex++ === 0 && p.access_level === 'elevated' ? 'chief' : 'guard') : null;
    persons.push({
      identityId: usable,
      profileId: p.id,
      role: p.profile_type === 'vip' ? 'vip' : p.profile_type === 'contractor' ? 'contractor' : 'employee',
      clearance: p.access_level,
      // The first VIP walks in through the main entrance (the camera the live demo shows); the others drive in.
      car: typeof p.custom_fields.parking_spot === 'string' && !(p.profile_type === 'vip' && p.id === people.byRole.vip[0]),
      dockDuty: p.company?.name === LOGISTICS && p.access_level !== 'basic',
      guard,
      night,
      activeFrom: p.profile_type === 'contractor' ? p.start_date : null,
      activeTo: p.profile_type === 'contractor' ? p.end_date : null,
    });
  }

  const blacklistedProfile = profiles.find((p) => blacklisted.has(p.id));
  const blacklistedIdentity = blacklistedProfile?.identities.find((i) => i.matching_enabled)?.id ?? null;
  const { identities: unknown } = await ctx.admin.request<{ identities: { id: string }[] }>(UNKNOWN, { org });
  // Only the seeded camera identities: live recognition may have created more since.
  const seeded = new Set(seededIdentities);
  const unknownIdentities = unknown.map((u) => u.id).filter((id) => seeded.has(id));
  return {
    people: persons,
    visitors,
    hosts,
    blacklistedIdentity,
    unknownIdentities,
    watchedIdentity: unknownIdentities[0] ?? null,
    terminatedIdentity: (terminatedProfile && identityByProfile[terminatedProfile]) || null,
    identityByProfile,
    companyByIdentity,
  };
}
