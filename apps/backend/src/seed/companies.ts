import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/** Seed organizations by key (as in SeedTenancyResult.orgs). */
export type OrgKey = keyof SeedTenancyResult['orgs'];

export type SeedCompaniesResult = {
  /** Company ids keyed `<org>/<company name>`. */
  companies: Record<string, string>;
  /** Work schedule ids keyed `<org>/<schedule name>`. */
  schedules: Record<string, string>;
};

type CompanySpec = { name: string; kind: string; suite?: string; domain: string; cost_center?: string };

/** Companies per organization: Nova Tower has 10 tenants, 2 contractors/vendors and 1 service provider. */
export const SEED_COMPANIES: Record<OrgKey, CompanySpec[]> = {
  nova: [
    { name: 'Aurora Analytics', kind: 'tenant', suite: '1201', domain: 'aurora-analytics.example' },
    { name: 'Bluefin Capital', kind: 'tenant', suite: '2201', domain: 'bluefin.example' },
    { name: 'Cobalt Legal LLP', kind: 'tenant', suite: '1802', domain: 'cobalt-legal.example' },
    { name: 'Driftwood Design Studio', kind: 'tenant', suite: '0904', domain: 'driftwood.example' },
    { name: 'Evergreen Health Partners', kind: 'tenant', suite: '1105', domain: 'evergreen-health.example' },
    { name: 'Fennel & Co Consulting', kind: 'tenant', suite: '1407', domain: 'fennel.example' },
    { name: 'Granite Logistics', kind: 'tenant', suite: '0602', domain: 'granite-logistics.example' },
    { name: 'Helix Biotech', kind: 'tenant', suite: '1510', domain: 'helix-bio.example' },
    { name: 'Ionic Software', kind: 'tenant', suite: '2003', domain: 'ionic-software.example' },
    { name: 'Juniper Media Group', kind: 'tenant', suite: '0808', domain: 'juniper-media.example' },
    { name: 'Keystone Facility Services', kind: 'contractor_vendor', domain: 'keystone-fs.example', cost_center: 'FM-200' },
    { name: 'Lumen Electrical Works', kind: 'contractor_vendor', domain: 'lumen-electric.example', cost_center: 'FM-210' },
    { name: 'Meridian Security Services', kind: 'service_provider', domain: 'meridian-security.example', cost_center: 'SEC-100' },
  ],
  riverside: [
    { name: 'Northwind Traders', kind: 'tenant', suite: 'B-12', domain: 'northwind.example' },
    { name: 'Oakridge Accounting', kind: 'tenant', suite: 'A-03', domain: 'oakridge.example' },
    { name: 'Pinecrest Security', kind: 'service_provider', domain: 'pinecrest-security.example', cost_center: 'SEC-01' },
  ],
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

export const SCHEDULES = { officeDay: 'Office Day', nightShift: 'Night Shift', security: 'Security 24/7' } as const;

const SCHEDULE_SPECS = [
  { name: SCHEDULES.officeDay, windows: [{ days: WEEKDAYS, from: '08:00', to: '20:00' }], description: 'Mon–Fri 08:00–20:00' },
  { name: SCHEDULES.nightShift, windows: [{ days: EVERY_DAY, from: '22:00', to: '06:00' }], description: 'Daily 22:00–06:00' },
  { name: SCHEDULES.security, windows: [{ days: EVERY_DAY, from: '00:00', to: '24:00' }], description: 'Around the clock' },
];

/** Custom profile attributes (same set, like the schedules, in both organizations). */
const ATTRIBUTES = [
  { key: 'badge_number', label: 'Badge number', data_type: 'string', sort_order: 10 },
  { key: 'parking_spot', label: 'Parking spot', data_type: 'string', sort_order: 20 },
  { key: 'clearance_expires', label: 'Clearance expires', data_type: 'date', sort_order: 30 },
  { key: 'shift', label: 'Shift', data_type: 'enum', options: ['day', 'night'], sort_order: 40 },
];

const EXISTING = `
  query SeedCompaniesExisting($org: uuid!) {
    companies(where: { organization_id: { _eq: $org } }) { id name }
    work_schedules(where: { organization_id: { _eq: $org } }) { id name }
  }
`;
const INSERT = `
  mutation SeedCompaniesInsert(
    $companies: [companies_insert_input!]!
    $schedules: [work_schedules_insert_input!]!
    $attributes: [custom_attribute_definitions_insert_input!]!
  ) {
    insert_companies(objects: $companies) { affected_rows }
    insert_work_schedules(objects: $schedules) { affected_rows }
    insert_custom_attribute_definitions(
      objects: $attributes
      on_conflict: { constraint: custom_attribute_definitions_organization_id_entity_key_key, update_columns: [] }
    ) { affected_rows }
  }
`;

type Named = { id: string; name: string };

async function existing(ctx: SeedContext, org: string): Promise<{ companies: Named[]; work_schedules: Named[] }> {
  return ctx.admin.request(EXISTING, { org });
}

/** Inserts the companies, schedules and attribute definitions that are missing (matched by name / key). */
export async function seedCompanies(ctx: SeedContext, tenancy: SeedTenancyResult): Promise<SeedCompaniesResult> {
  const result: SeedCompaniesResult = { companies: {}, schedules: {} };
  for (const key of Object.keys(SEED_COMPANIES) as OrgKey[]) {
    const org = tenancy.orgs[key];
    const before = await existing(ctx, org);
    const haveCompany = new Set(before.companies.map((c) => c.name));
    const haveSchedule = new Set(before.work_schedules.map((s) => s.name));
    await ctx.admin.request(INSERT, {
      companies: SEED_COMPANIES[key]
        .filter((c) => !haveCompany.has(c.name))
        .map(({ domain, ...c }) => ({ ...c, organization_id: org, contact_email: `office@${domain}` })),
      schedules: SCHEDULE_SPECS
        .filter((s) => !haveSchedule.has(s.name))
        .map((s) => ({ ...s, organization_id: org, timezone: 'Europe/Moscow' })),
      attributes: ATTRIBUTES.map((a) => ({ ...a, organization_id: org, entity: 'profile' })),
    });
    const after = await existing(ctx, org);
    for (const c of after.companies) result.companies[`${key}/${c.name}`] = c.id;
    for (const s of after.work_schedules) result.schedules[`${key}/${s.name}`] = s.id;
  }
  return result;
}

/** Email domain of a seeded company. */
export function companyDomain(org: OrgKey, name: string): string {
  return SEED_COMPANIES[org].find((c) => c.name === name)?.domain ?? 'visitor.example';
}
