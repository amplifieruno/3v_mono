import { companyDomain, SCHEDULES, SEED_COMPANIES, type OrgKey } from './companies.js';
import {
  CONTRACTOR_TITLES,
  DEPARTMENTS,
  FIRST_NAMES,
  JOB_TITLES,
  LAST_NAMES,
  SECURITY_TITLES,
  VIP_TITLES,
} from './peopleNames.js';
import { dateFrom, daysFrom, seededRandom, type Random } from './random.js';
import { SEED_ORGS } from './tenancy.js';

/** Seed role of a person: the profile type, plus `blacklisted` (a visitor profile the watch-list seed flags later). */
export type PersonRole = 'employee' | 'contractor' | 'visitor' | 'vip' | 'blacklisted';

export type ConsentSpec = {
  purpose: 'biometric_processing' | 'tracking';
  status: 'granted' | 'withdrawn';
  method: 'paper' | 'electronic' | 'verbal';
  granted_at: string;
  withdrawn_at?: string;
};

export type PersonSpec = {
  /** Seed key, stored as profiles.external_id (unique per organization). */
  externalId: string;
  role: PersonRole;
  company: string | null;
  schedule: string | null;
  profile: {
    profile_type: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string;
    employee_id: string | null;
    department: string | null;
    job_title: string | null;
    access_level: string;
    start_date: string;
    end_date: string | null;
    notes: string | null;
    custom_fields: Record<string, string>;
  };
  consents: ConsentSpec[];
  document?: { kind: 'id_card' | 'contract' | 'nda'; title: string };
};

type Mix = { vips: number; blacklisted: number; perTenant: number[]; security: number; contractors: number; visitors: number };

/** Nova Tower: 3 + 1 + 112 + 8 + 14 + 12 = 150 people. Riverside: a dozen. */
const MIX: Record<OrgKey, Mix> = {
  nova: { vips: 3, blacklisted: 1, perTenant: [14, 12, 11, 10, 12, 10, 11, 12, 12, 8], security: 8, contractors: 14, visitors: 12 },
  riverside: { vips: 0, blacklisted: 0, perTenant: [5, 4], security: 2, contractors: 0, visitors: 1 },
};

const VIP_COMPANIES = ['Bluefin Capital', 'Helix Biotech', 'Ionic Software'];

class Planner {
  private readonly rnd: Random;
  private readonly used = new Set<string>();
  readonly people: PersonSpec[] = [];

  constructor(
    private readonly org: OrgKey,
    private readonly now: Date,
  ) {
    this.rnd = seededRandom(SEED_ORGS[org].slug);
  }

  private name(): { first: string; last: string } {
    for (;;) {
      const first = this.rnd.pick(FIRST_NAMES);
      const last = this.rnd.pick(LAST_NAMES);
      if (!this.used.has(`${first} ${last}`)) {
        this.used.add(`${first} ${last}`);
        return { first, last };
      }
    }
  }

  private consent(purpose: ConsentSpec['purpose'], startDate: string, withdrawn = false): ConsentSpec {
    const granted = `${startDate}T09:${String(this.rnd.int(0, 59)).padStart(2, '0')}:00Z`;
    const method = this.rnd.pick(['paper', 'electronic', 'electronic'] as const);
    if (!withdrawn) return { purpose, status: 'granted', method, granted_at: granted };
    return { purpose, status: 'withdrawn', method, granted_at: granted, withdrawn_at: daysFrom(this.now, -this.rnd.int(2, 20)).toISOString() };
  }

  add(role: PersonRole, company: string | null, extra: Partial<PersonSpec['profile']> & { schedule?: string | null }): PersonSpec {
    const { first, last } = this.name();
    const index = this.people.length + 1;
    const { schedule = SCHEDULES.officeDay, ...overrides } = extra;
    const startDate = overrides.start_date ?? dateFrom(this.now, -this.rnd.int(30, 2500));
    const domain = company ? companyDomain(this.org, company) : 'mail.example';
    const person: PersonSpec = {
      externalId: `seed:${String(index).padStart(3, '0')}`,
      role,
      company,
      schedule,
      profile: {
        profile_type: role === 'blacklisted' ? 'visitor' : role,
        first_name: first,
        last_name: last,
        email: `${first}.${last}@${domain}`.toLowerCase(),
        phone: `+7 495 ${this.rnd.int(200, 999)}-${this.rnd.int(10, 99)}-${this.rnd.int(10, 99)}`,
        employee_id: null,
        department: null,
        job_title: null,
        access_level: 'standard',
        start_date: startDate,
        end_date: null,
        notes: null,
        custom_fields: {},
        ...overrides,
      },
      consents: role === 'visitor' || role === 'blacklisted' ? [] : [this.consent('biometric_processing', startDate)],
    };
    this.people.push(person);
    return person;
  }

  badge(): string {
    return `${this.org === 'nova' ? 'NT' : 'RO'}-${String(1000 + this.people.length).padStart(4, '0')}`;
  }

  get random(): Random {
    return this.rnd;
  }
}

function addEmployees(plan: Planner, org: OrgKey, mix: Mix): void {
  const tenants = SEED_COMPANIES[org].filter((c) => c.kind === 'tenant');
  // Round-robin over tenants, so the first employees (who get faces) work for different companies.
  const remaining = tenants.map((_, i) => mix.perTenant[i] ?? 0);
  for (let round = 0; remaining.some((n) => n > 0); round += 1) {
    tenants.forEach((tenant, i) => {
      if (remaining[i] === 0) return;
      remaining[i] -= 1;
      const department = plan.random.pick(DEPARTMENTS);
      const night = tenant.name === 'Granite Logistics' && round % 4 === 3;
      const fields: Record<string, string> = { badge_number: plan.badge(), shift: night ? 'night' : 'day' };
      if (plan.random.chance(0.3)) fields.parking_spot = `P${plan.random.int(1, 2)}-${plan.random.int(10, 99)}`;
      const person = plan.add('employee', tenant.name, {
        employee_id: `${tenant.name.slice(0, 3).toUpperCase()}-${String(round + 1).padStart(3, '0')}`,
        department,
        job_title: plan.random.pick(JOB_TITLES[department]),
        access_level: plan.random.chance(0.2) ? 'basic' : 'standard',
        custom_fields: fields,
        schedule: night ? SCHEDULES.nightShift : SCHEDULES.officeDay,
      });
      if (plan.random.chance(0.4)) person.consents.push({ ...person.consents[0], purpose: 'tracking' });
      if (round === 0 && i < 2) person.document = { kind: 'id_card', title: 'Passport copy' };
    });
  }
}

function addOthers(plan: Planner, org: OrgKey, mix: Mix, now: Date): void {
  const security = SEED_COMPANIES[org].find((c) => c.kind === 'service_provider')?.name ?? null;
  for (let i = 0; i < mix.security; i += 1) {
    const night = i % 2 === 1;
    plan.add('employee', security, {
      department: 'Security',
      job_title: SECURITY_TITLES[i % SECURITY_TITLES.length],
      access_level: i === 0 ? 'elevated' : 'standard',
      custom_fields: { badge_number: plan.badge(), shift: night ? 'night' : 'day' },
      schedule: night ? SCHEDULES.nightShift : SCHEDULES.security,
    });
  }
  const vendors = SEED_COMPANIES[org].filter((c) => c.kind === 'contractor_vendor').map((c) => c.name);
  for (let i = 0; i < mix.contractors; i += 1) {
    const person = plan.add('contractor', vendors[i % vendors.length] ?? null, {
      job_title: CONTRACTOR_TITLES[i % CONTRACTOR_TITLES.length],
      access_level: 'basic',
      // Contractors come when booked (no fixed schedule, so no attendance tracking).
      schedule: null,
      start_date: dateFrom(now, -plan.random.int(20, 400)),
      // Every fifth contractor (from the second) has access ending within a month: the "Contractors ending soon" segment.
      end_date: dateFrom(now, i % 5 === 1 ? plan.random.int(6, 26) : plan.random.int(30, 300)),
      custom_fields: { clearance_expires: dateFrom(now, plan.random.int(10, 200)) },
    });
    if (i < 3) person.document = { kind: 'contract', title: 'Service contract' };
    // The last two contractors withdrew biometric consent (matching stays off for them).
    if (i >= mix.contractors - 2) person.consents = [{ ...person.consents[0], status: 'withdrawn', withdrawn_at: dateFrom(now, -5) + 'T12:00:00Z' }];
  }
  for (let i = 0; i < mix.visitors; i += 1) {
    const visit = -plan.random.int(0, 20);
    const person = plan.add('visitor', null, {
      access_level: 'basic',
      start_date: dateFrom(now, visit),
      end_date: dateFrom(now, visit + plan.random.int(0, 2)),
      schedule: null,
      email: null,
    });
    if (i % 2 === 0) person.consents = [{ purpose: 'biometric_processing', status: 'granted', method: 'verbal', granted_at: `${person.profile.start_date}T10:00:00Z` }];
  }
}

/** Deterministic people of one seed organization (same input → same list). */
export function buildPeople(org: OrgKey, now: Date): PersonSpec[] {
  const mix = MIX[org];
  const plan = new Planner(org, now);
  for (let i = 0; i < mix.vips; i += 1) {
    const person = plan.add('vip', VIP_COMPANIES[i], {
      department: 'Management',
      job_title: VIP_TITLES[i],
      access_level: 'elevated',
      custom_fields: { badge_number: plan.badge(), parking_spot: `P1-0${i + 1}`, shift: 'day' },
      // Executives keep no work schedule (not in the attendance report).
      schedule: null,
    });
    person.document = { kind: 'nda', title: 'Building NDA' };
  }
  for (let i = 0; i < mix.blacklisted; i += 1) {
    plan.add('blacklisted', null, {
      access_level: 'basic',
      start_date: dateFrom(now, -90),
      schedule: null,
      email: null,
      notes: 'Watch-list demo persona (fictional).',
    });
  }
  addEmployees(plan, org, mix);
  addOthers(plan, org, mix, now);
  return plan.people;
}
