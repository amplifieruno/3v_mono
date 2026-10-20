/**
 * Pure data of the compliance flows of the seed (slice 10): data subject requests and their dedicated subjects, the
 * integrations with the two HR fixture versions, and export definitions. Nova Tower only.
 */

/** A profile the DSRs need: a planned demo person (role and index in plan order) or a dedicated subject. */
export type DsrSubject = { role: 'vip' | 'employee'; index: number } | { dedicated: 'erasure' | 'restriction' };

export type DsrSpec = {
  key: string;
  type: 'access' | 'erasure' | 'restriction' | 'rectification';
  subject: DsrSubject;
  daysAgo: number;
  notes: string;
  details?: Record<string, unknown>;
};

/**
 * The requests in filing order: access (completed with a bundle), restriction (completed, the profile restricted),
 * erasure (completed, dedicated person), rectification (waiting for org_admin) and an overdue rectification (filed
 * 34 days ago, still open: past its 30-day due date).
 */
export const DSRS: readonly DsrSpec[] = [
  {
    key: 'access',
    type: 'access',
    subject: { role: 'vip', index: 0 },
    daysAgo: 9,
    notes: 'Request received by e-mail; identity verified at the reception desk.',
  },
  {
    key: 'restriction',
    type: 'restriction',
    subject: { dedicated: 'restriction' },
    daysAgo: 6,
    notes: 'The person contests the accuracy of a camera match; processing restricted while it is verified.',
  },
  {
    key: 'erasure',
    type: 'erasure',
    subject: { dedicated: 'erasure' },
    daysAgo: 12,
    notes: 'Former contractor asked for erasure after the end of the contract.',
  },
  {
    key: 'rectification',
    type: 'rectification',
    subject: { role: 'employee', index: 4 },
    daysAgo: 3,
    notes: 'Job title is out of date after an internal transfer.',
    details: { changes: { job_title: 'Senior Facilities Coordinator' }, source: 'HR confirmation pending' },
  },
  {
    key: 'overdue',
    type: 'rectification',
    subject: { role: 'employee', index: 9 },
    daysAgo: 34,
    notes: 'Department is wrong in the visitor badge printout; waiting for the tenant to confirm.',
    details: { changes: { department: 'Customer Success' } },
  },
];

export type DedicatedSubjectSpec = {
  externalId: string;
  profile: Record<string, string>;
  /** Two face crops blended into a face of a person who does not exist (enrolled through the real enrollment). */
  faces: readonly [string, string];
  document?: { kind: string; title: string };
};

/**
 * Dedicated people of the erasure and restriction requests (the demo cast stays intact). Their faces are blends of
 * crop pairs that are neither sandbox pairs nor include an unknown camera face, and stay above the enrollment
 * duplicate distance from every enrolled person (checked against the seeded faces).
 */
export const DEDICATED_SUBJECTS: Record<'erasure' | 'restriction', DedicatedSubjectSpec> = {
  erasure: {
    externalId: 'compliance:erasure-subject',
    profile: {
      profile_type: 'contractor',
      first_name: 'Marek',
      last_name: 'Novotny',
      email: 'marek.novotny@contractor.example',
      phone: '+7 900 555-0142',
      department: 'Fit-out',
      job_title: 'Electrician',
      access_level: 'basic',
      notes: 'Former fit-out contractor (compliance demo: erasure request).',
    },
    faces: ['person-01', 'person-07'],
    document: { kind: 'contract', title: 'Service contract' },
  },
  restriction: {
    externalId: 'compliance:restriction-subject',
    profile: {
      profile_type: 'employee',
      first_name: 'Laura',
      last_name: 'Fischer',
      email: 'laura.fischer@tenant.example',
      phone: '+7 900 555-0178',
      department: 'Legal',
      job_title: 'Counsel',
      access_level: 'basic',
      notes: 'Compliance demo: restriction of processing requested.',
    },
    faces: ['person-04', 'person-06'],
  },
};

/** HR fixture columns (Workday-style export) and the integration's field mapping to profile columns. */
export const HR_EXTERNAL_ID_FIELD = 'EmployeeNumber';
export const HR_FIELD_MAPPING: Record<string, string> = {
  EmployeeNumber: 'employee_id',
  GivenName: 'first_name',
  FamilyName: 'last_name',
  WorkEmail: 'email',
  Department: 'department',
  JobTitle: 'job_title',
  HireDate: 'start_date',
};
const HR_HEADER = ['EmployeeNumber', 'GivenName', 'FamilyName', 'WorkEmail', 'Department', 'JobTitle', 'HireDate'];

type HrRow = [string, string, string, string, string, string];

/** External ids use the HR system's `WD-` numbers: never the seed's `seed:` / `compliance:` keys. */
const HR_V1: readonly HrRow[] = [
  ['WD-20481', 'Hannah', 'Moreau', 'Finance', 'Accountant', '2023-03-01'],
  ['WD-20482', 'Oskar', 'Lindgren', 'Operations', 'Facilities Planner', '2022-09-12'],
  ['WD-20483', 'Priya', 'Raman', 'IT', 'Network Engineer', '2024-01-15'],
  ['WD-20484', 'Tomas', 'Kral', 'Operations', 'Shift Supervisor', '2021-06-01'],
  ['WD-20485', 'Chloe', 'Bernard', 'Marketing', 'Brand Manager', '2023-11-20'],
  ['WD-20486', 'Yusuf', 'Demir', 'Security', 'Security Analyst', '2024-04-08'],
  ['WD-20487', 'Ines', 'Carvalho', 'Finance', 'Payroll Specialist', '2022-02-14'],
  // A broken record (no given name): skipped with the code missing_name, fixed in the next export.
  ['WD-20488', '', 'Okafor', 'IT', 'Service Desk Analyst', '2025-02-03'],
];

/** Next week's export: Kral left (deactivated), two changes, Okafor fixed and a new hire. */
const HR_V2: readonly HrRow[] = [
  ['WD-20481', 'Hannah', 'Moreau', 'Finance', 'Accountant', '2023-03-01'],
  ['WD-20482', 'Oskar', 'Lindgren', 'Real Estate', 'Facilities Planner', '2022-09-12'],
  ['WD-20483', 'Priya', 'Raman', 'IT', 'Network Engineer', '2024-01-15'],
  ['WD-20485', 'Chloe', 'Bernard', 'Marketing', 'Brand Manager', '2023-11-20'],
  ['WD-20486', 'Yusuf', 'Demir', 'Security', 'Senior Security Analyst', '2024-04-08'],
  ['WD-20487', 'Ines', 'Carvalho', 'Finance', 'Payroll Specialist', '2022-02-14'],
  ['WD-20488', 'Emeka', 'Okafor', 'IT', 'Service Desk Analyst', '2025-02-03'],
  ['WD-20489', 'Sofia', 'Marino', 'Legal', 'Paralegal', '2026-10-01'],
];

function hrCsv(rows: readonly HrRow[]): Buffer {
  const email = (first: string, last: string) => (first ? `${first}.${last}@novatower-hr.example`.toLowerCase() : '');
  const lines = rows.map(([id, first, last, dept, title, hired]) => [id, first, last, email(first, last), dept, title, hired].join(','));
  return Buffer.from(`${[HR_HEADER.join(','), ...lines].join('\n')}\n`, 'utf8');
}

export const HR_FIXTURES = { v1: hrCsv(HR_V1), v2: hrCsv(HR_V2) } as const;
export const HR_EXTERNAL_IDS = [...new Set([...HR_V1, ...HR_V2].map(([id]) => id))];

/** HR runs: v1 two weeks ago, v2 a week ago, v2 again yesterday (no changes), at 02:00 local. */
export const HR_RUNS: readonly { fixture: keyof typeof HR_FIXTURES; daysAgo: number }[] = [
  { fixture: 'v1', daysAgo: 14 },
  { fixture: 'v2', daysAgo: 7 },
  { fixture: 'v2', daysAgo: 1 },
];

export const INTEGRATIONS = {
  hr: {
    name: 'Workday HR feed',
    description: 'Daily employee master data import (fixture file in place of the HR API).',
    kind: 'hr',
    provider: 'Workday (fixture)',
    direction: 'inbound',
    schedule: { schedule_cron: '0 2 * * *', schedule_timezone: 'Europe/Moscow' },
  },
  siem: {
    name: 'Splunk security events',
    description: 'Security events forwarded to the corporate SIEM every hour (stub transport).',
    kind: 'siem',
    provider: 'Splunk HEC (stub)',
    direction: 'outbound',
    schedule: { schedule_cron: '0 * * * *', schedule_timezone: 'UTC' },
    endpoint: 'https://siem.novatower.example/services/collector',
  },
  bms: {
    name: 'Building management occupancy',
    description: 'Occupancy snapshot for the HVAC controller (stub transport); the gateway is currently unreachable.',
    kind: 'bms',
    provider: 'BACnet gateway (stub)',
    direction: 'outbound',
    endpoint: 'bacnet://bms-gw.novatower.example:47808',
    failure: 'bms_gateway_unreachable',
  },
} as const;

/** SIEM runs hours ago; BMS: one good run yesterday, then failures (the gateway went down). */
export const SIEM_RUN_HOURS_AGO = [3, 2, 1] as const;
export const BMS_OK_HOURS_AGO = 26;
export const BMS_FAILED_RUNS = 2;

export type ExportSpec = {
  name: string;
  description: string;
  entity: string;
  format: 'csv' | 'json' | 'xlsx';
  mode: 'full' | 'incremental';
  filters: Record<string, unknown>;
  scheduleCron: string;
  maxRows?: number;
  /** Jobs run by the seed one after the other (an incremental definition continues from its cursor). */
  jobs: number;
};

export const EXPORTS: readonly ExportSpec[] = [
  {
    name: 'Monthly incident register',
    description: 'All incidents for the monthly security review (CSV).',
    entity: 'incidents',
    format: 'csv',
    mode: 'full',
    filters: {},
    scheduleCron: '0 6 1 * *',
    jobs: 1,
  },
  {
    name: 'Access decisions to the data warehouse',
    description: 'Incremental feed of door decisions (JSON, 5000 rows per run).',
    entity: 'access_decisions',
    format: 'json',
    mode: 'incremental',
    filters: {},
    scheduleCron: '30 1 * * *',
    maxRows: 5000,
    jobs: 2,
  },
  {
    name: 'Active staff directory',
    description: 'Active employee profiles for the tenant portal (XLSX).',
    entity: 'profiles',
    format: 'xlsx',
    mode: 'full',
    filters: { profile_type: { _eq: 'employee' }, status: { _eq: 'active' } },
    scheduleCron: '0 7 * * 1',
    jobs: 1,
  },
];
