import { describeScreen } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { COMPANY_KINDS, COMPANY_STATUSES } from '../../src/enums/organization';
import { ITAP_TABLES } from '../../src/modules';
import { COMPANY_RESOURCE, company, companyFields } from '../../src/modules/organization/companies';
import {
  WORK_SCHEDULE_RESOURCE,
  workSchedule,
  workScheduleFields,
} from '../../src/modules/organization/work-schedules';

/**
 * Companies (tenants, contractors, service providers, visitor organizations) and
 * work schedules: list declarations, the org_admin write columns as the active form
 * fields, and the mappings over `itap.companies` / `itap.work_schedules`.
 */

/** The `org_admin` insert/update columns (Hasura metadata). */
const COMPANY_WRITABLE = [
  'contact_email',
  'contact_phone',
  'cost_center',
  'kind',
  'name',
  'status',
  'suite',
];
const SCHEDULE_WRITABLE = ['description', 'name', 'timezone', 'windows'];

interface ListView {
  readonly columns?: readonly string[];
  readonly search?: { readonly fields?: readonly string[] };
  readonly filters?: { readonly fields?: readonly string[] };
  readonly savedViews?: readonly {
    readonly id: string;
    readonly texts?: unknown;
    readonly state: { readonly filters?: readonly { field: string; op: string; value: unknown }[] };
  }[];
}

function listOf(name: string): ListView {
  const resource = app.registry.get(name) as { views?: { list?: ListView } } | undefined;
  const list = resource?.views?.list;
  if (list === undefined) throw new Error(`${name} has no list view`);
  return list;
}

function activeFields(screen: ReturnType<typeof describeScreen>): string[] {
  return Object.entries(screen.fields)
    .filter(([, status]) => status === 'active')
    .map(([name]) => name)
    .sort();
}

beforeAll(async () => {
  await app.ready;
});

describe('companies', () => {
  it('should declare the list columns, search, filters and saved views', () => {
    const list = listOf(COMPANY_RESOURCE);
    expect(list.columns).toEqual(['name', 'kind', 'status', 'suite', 'contact_email']);
    expect(list.search?.fields).toEqual(['name', 'contact_email', 'cost_center']);
    expect(list.filters?.fields).toEqual(['kind', 'status']);
    const views = Object.fromEntries(
      (list.savedViews ?? []).map((view) => [view.texts, view.state.filters]),
    );
    expect(views).toEqual({
      Tenants: [{ field: 'kind', op: 'eq', value: 'tenant' }],
      'Contractors and vendors': [
        { field: 'kind', op: 'in', value: ['contractor_vendor', 'service_provider'] },
      ],
    });
  });

  it('should map itap.companies and select every declared column', () => {
    expect(ITAP_TABLES[COMPANY_RESOURCE]).toMatchObject({
      table: 'companies',
      selectFields: Object.keys(companyFields),
    });
  });

  it('should make exactly the org_admin write columns editable', () => {
    for (const mode of ['create', 'edit'] as const) {
      const screen = describeScreen(company, mode, { sources: { record: {} } });
      expect(screen.issues, mode).toEqual([]);
      expect(activeFields(screen), mode).toEqual(COMPANY_WRITABLE);
    }
  });

  it('should take the kind and status values of the enum tables, defaulting like the database', () => {
    expect(COMPANY_KINDS).toEqual([
      'tenant',
      'contractor_vendor',
      'service_provider',
      'visitor_org',
    ]);
    expect(COMPANY_STATUSES).toEqual(['active', 'inactive']);
    expect(companyFields.kind.opts.default).toBe('tenant');
    expect(companyFields.status.opts.default).toBe('active');
  });

  it('should refuse a malformed contact email and leave an empty one alone', () => {
    const validate = (companyFields.contact_email.opts as { validate: (v: unknown) => unknown })
      .validate;
    expect(validate('office@aurora-analytics.example')).toBeNull();
    expect(validate('')).toBeNull();
    expect(validate(null)).toBeNull();
    expect(validate('office at aurora')).toBe('Enter a valid email address.');
  });
});

describe('work schedules', () => {
  it('should list name, time zone, windows and description', () => {
    const list = listOf(WORK_SCHEDULE_RESOURCE);
    expect(list.columns).toEqual(['name', 'timezone', 'windows', 'description']);
    expect(list.search?.fields).toEqual(['name']);
  });

  it('should map itap.work_schedules and make exactly the org_admin write columns editable', () => {
    expect(ITAP_TABLES[WORK_SCHEDULE_RESOURCE]).toMatchObject({
      table: 'work_schedules',
      selectFields: Object.keys(workScheduleFields),
    });
    for (const mode of ['create', 'edit'] as const) {
      const screen = describeScreen(workSchedule, mode, { sources: { record: {} } });
      expect(screen.issues, mode).toEqual([]);
      expect(activeFields(screen), mode).toEqual(SCHEDULE_WRITABLE);
    }
  });

  it('should use the reusable time zone and time window fields', () => {
    expect(workScheduleFields.timezone.ui).toMatchObject({ input: 'itap.timezone' });
    expect(workScheduleFields.windows.ui).toMatchObject({ input: 'itap.time-windows' });
    expect(workScheduleFields.timezone.opts.default).toBe('UTC');
    expect((workScheduleFields.windows.opts as { default?: unknown }).default).toEqual([]);
  });
});
