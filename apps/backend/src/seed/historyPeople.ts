import type { SeedPeopleResult } from './people.js';
import type { HistoryHost, HistoryInput, HistoryPerson, HistoryVisitor } from './historyPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * The tracked people of the Nova Tower history. Only the manifest faces have enrolled identities; every other
 * profile that is tracked on camera (employees and day security, VIPs, contractors and visitors with a granted
 * biometric consent) gets one primary identity of source `import` (access-control import, no face templates), so the
 * history covers the whole building. Night-shift staff are not replayed (their shifts would be after-hours events
 * every night). Unknown faces are the seeded camera identities without a profile.
 */
type ProfileRow = {
  id: string;
  profile_type: string;
  access_level: string;
  start_date: string | null;
  end_date: string | null;
  custom_fields: Record<string, unknown>;
  company: { id: string; name: string } | null;
  work_schedule: { name: string } | null;
  consent_records: { status: string }[];
  identities: { id: string; is_primary_for_profile: boolean; matching_enabled: boolean }[];
};

const PROFILES = `
  query SeedHistoryProfiles($org: uuid!) {
    profiles(where: { organization_id: { _eq: $org }, external_id: { _like: "seed:%" } }, order_by: { external_id: asc }) {
      id profile_type access_level start_date end_date custom_fields
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
const INSERT_IDENTITIES = `
  mutation SeedHistoryIdentities($objects: [identities_insert_input!]!) {
    insert_identities(objects: $objects) { returning { id profile_id } }
  }
`;

export type HistoryPeople = Omit<HistoryInput, 'now' | 'timezone'> & {
  /** Identity of every tracked profile (profile id -> identity id). */
  identityByProfile: Record<string, string>;
  /** Tenant company name of every tracked employee (estimated locations on their floor). */
  companyByIdentity: Record<string, string>;
};

const LOGISTICS = 'Granite Logistics';

function tracked(p: ProfileRow, blacklisted: Set<string>): boolean {
  if (blacklisted.has(p.id)) return false;
  if (p.work_schedule?.name === 'Night Shift' || p.custom_fields.shift === 'night') return false;
  if (p.profile_type === 'employee' || p.profile_type === 'vip') return true;
  return p.consent_records[0]?.status === 'granted';
}

/** Loads the Nova Tower people, creates the missing history identities and returns the plan input. */
export async function historyPeople(ctx: SeedContext, org: string, people: SeedPeopleResult): Promise<HistoryPeople> {
  const load = async () => (await ctx.admin.request<{ profiles: ProfileRow[] }>(PROFILES, { org })).profiles;
  const blacklisted = new Set(people.byRole.blacklisted);
  let profiles = await load();
  const missing = profiles.filter((p) => tracked(p, blacklisted) && p.identities.length === 0);
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
    const security = p.work_schedule?.name === 'Security 24/7';
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
      activeFrom: p.profile_type === 'contractor' ? p.start_date : null,
      activeTo: p.profile_type === 'contractor' ? p.end_date : null,
    });
  }

  const blacklistedProfile = profiles.find((p) => blacklisted.has(p.id));
  const blacklistedIdentity = blacklistedProfile?.identities.find((i) => i.matching_enabled)?.id ?? null;
  const { identities: unknown } = await ctx.admin.request<{ identities: { id: string }[] }>(UNKNOWN, { org });
  const unknownIdentities = unknown.map((u) => u.id);
  return {
    people: persons,
    visitors,
    hosts,
    blacklistedIdentity,
    unknownIdentities,
    watchedIdentity: unknownIdentities[0] ?? null,
    identityByProfile,
    companyByIdentity,
  };
}
