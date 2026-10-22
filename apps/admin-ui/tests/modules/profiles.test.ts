import { describeScreen } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { PROFILE_RESOURCE } from '../../src/data/resource-names';
import { ACCESS_LEVELS, PROFILE_STATUSES, PROFILE_TYPES } from '../../src/enums/people';
import { ITAP_TABLES } from '../../src/modules';
import { PROFILE_CHECKS, profile } from '../../src/modules/people/profile';
import { profileActivityOf } from '../../src/modules/people/profile-activity';
import { AVATAR_FILE_KIND, profileFields } from '../../src/modules/people/profile-fields';
import { isoDay, profileSavedViews } from '../../src/modules/people/profile-views';

/**
 * Profiles: the org_admin write columns per record type, the read-only columns, the list's saved
 * views, the date order check, no delete, the avatar file kind and the activity facts' mapping.
 */

/** The `org_admin` insert/update columns of `itap.profiles` (Hasura metadata), less `profile_type` on edit. */
const WRITABLE = [
  'access_level',
  'avatar_file_id',
  'company_id',
  'custom_fields',
  'department',
  'email',
  'employee_id',
  'end_date',
  'external_id',
  'first_name',
  'job_title',
  'last_name',
  'notes',
  'phone',
  'start_date',
  'status',
  'work_schedule_id',
];

const without = (names: readonly string[]) => WRITABLE.filter((name) => !names.includes(name));

function activeFields(screen: ReturnType<typeof describeScreen>): string[] {
  return Object.entries(screen.fields)
    .filter(([, status]) => status === 'active')
    .map(([name]) => name)
    .sort();
}

beforeAll(async () => {
  await app.ready;
});

describe('profile record types', () => {
  it.each([
    ['employee', WRITABLE],
    ['visitor', without(['employee_id', 'department', 'job_title', 'work_schedule_id'])],
    ['contractor', without(['employee_id', 'department'])],
    ['vip', without(['employee_id', 'work_schedule_id'])],
  ])('should edit exactly the org_admin columns of a %s', (type, expected) => {
    const screen = describeScreen(profile, 'edit', { sources: { record: { profile_type: type } } });
    expect(screen.issues).toEqual([]);
    expect(activeFields(screen)).toEqual(expected);
  });

  it('should take the type on create only, as one of the enum table’s values', () => {
    const screen = describeScreen(profile, 'create', { sources: { values: { profile_type: 'employee' } } });
    expect(screen.issues).toEqual([]);
    expect(activeFields(screen)).toEqual([...WRITABLE, 'profile_type'].sort());
    expect(PROFILE_TYPES).toEqual(['employee', 'visitor', 'contractor', 'vip']);
    expect(PROFILE_STATUSES).toEqual(['active', 'inactive', 'suspended', 'terminated']);
    expect(ACCESS_LEVELS).toEqual(['basic', 'standard', 'elevated', 'admin']);
    expect(profileFields.status.opts.default).toBe('active');
    expect(profileFields.access_level.opts.default).toBe('basic');
  });

  it('should never write the computed, restriction and erasure columns', () => {
    for (const name of [
      'code',
      'has_face',
      'is_blacklisted',
      'identities_count',
      'processing_restricted',
      'restricted_at',
      'restricted_by',
      'restriction_reason',
      'erased_at',
    ] as const) {
      const field = profileFields[name] as { opts: { system?: boolean; write?: string } };
      expect(field.opts.system === true || field.opts.write === 'never', name).toBe(true);
    }
  });

  it('should offer no delete: profiles end by status', () => {
    const resource = app.registry.get(PROFILE_RESOURCE) as { operations?: { delete?: boolean } };
    expect(resource.operations?.delete).toBe(false);
  });
});

describe('profile list and mapping', () => {
  it('should map itap.profiles and select every declared column', () => {
    expect(ITAP_TABLES[PROFILE_RESOURCE]).toMatchObject({
      table: 'profiles',
      selectFields: Object.keys(profileFields),
    });
  });

  it('should store the photo as an avatar in the organization bucket', () => {
    expect(profileFields.avatar_file_id.meta).toMatchObject({
      bucket: 'organization',
      kind: AVATAR_FILE_KIND,
      sensitive: false,
    });
    expect(AVATAR_FILE_KIND).toBe('avatar');
  });

  it('should declare the four saved views, visitors on the day the console loaded', () => {
    const views = profileSavedViews(new Date(2026, 9, 22, 23, 30));
    expect(Object.fromEntries(views.map((view) => [view.texts, view.state.filters]))).toEqual({
      Employees: [{ field: 'profile_type', op: 'eq', value: 'employee' }],
      'Visitors today': [
        { field: 'profile_type', op: 'eq', value: 'visitor' },
        { field: 'start_date', op: 'lte', value: '2026-10-22' },
        { field: 'end_date', op: 'gte', value: '2026-10-22' },
      ],
      Blacklisted: [{ field: 'is_blacklisted', op: 'eq', value: true }],
      'Pending face link': [
        { field: 'has_face', op: 'eq', value: false },
        { field: 'status', op: 'eq', value: 'active' },
      ],
    });
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('profile checks and activity', () => {
  const datesOrdered = PROFILE_CHECKS.find((check) => check.id === 'profileDatesOrdered');
  const blocks = (values: Record<string, unknown>) =>
    (datesOrdered?.when as (di: { values: Record<string, unknown> }) => boolean)({ values });

  it('should block an end date before the start date, as profiles_dates_ordered does', () => {
    expect(datesOrdered?.severity).toBe('error');
    expect(blocks({ start_date: '2026-10-22', end_date: '2026-10-21' })).toBe(true);
    expect(blocks({ start_date: '2026-10-22', end_date: '2026-10-22' })).toBe(false);
    expect(blocks({ start_date: '2026-10-22', end_date: null })).toBe(false);
    expect(blocks({ start_date: null, end_date: '2026-10-01' })).toBe(false);
  });

  it('should flatten the stats row, the top area by name and a stringified numeric', () => {
    const row = {
      visits_last_30d: 12,
      avg_dwell_minutes: '431.50',
      after_hours_visits_30d: 1,
      last_seen_at: '2026-10-21T17:02:00Z',
      as_of: '2026-10-22T06:00:00Z',
      top_area: { name: 'Floor 12' },
    };
    expect(profileActivityOf({ profile_activity_stats: [row] })).toEqual({
      ...row,
      avg_dwell_minutes: 431.5,
      top_area: 'Floor 12',
    });
    expect(profileActivityOf({ profile_activity_stats: [] })).toBeNull();
    expect(profileActivityOf(null)).toBeNull();
  });
});
