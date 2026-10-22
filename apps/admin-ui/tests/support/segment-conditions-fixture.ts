import type { CatalogField } from '../../src/fields/segment-conditions-operators';
import type { ConditionRefs } from '../../src/fields/segment-conditions-refs';

/** A profiles catalog and the records of an organization, for the segment conditions tests. */

export const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
export const [ACME, NIGHT, LOBBY, TOWER, VIPS, AUTO, FACES, SELF] = [1, 2, 3, 4, 5, 6, 7, 8].map(id) as [
  string, string, string, string, string, string, string, string,
];

const field = (name: string, type: string, operators: string[], extra: Partial<CatalogField> = {}): CatalogField => ({
  field: name,
  type,
  operators,
  enumValues: null,
  label: name,
  ...extra,
});

/** The profiles catalog as the dev stack's `segment_field_catalog('profiles', org)` answers it (abridged). */
export const PROFILE_FIELDS: CatalogField[] = [
  field('first_name', 'text', ['eq', 'neq', 'in', 'nin', 'contains'], { label: 'First name' }),
  field('department', 'text', ['eq', 'neq', 'in', 'nin', 'contains', 'is_null'], { label: 'Department' }),
  field('profile_type', 'enum', ['eq', 'neq', 'in', 'nin'], { label: 'Profile type', enumValues: ['contractor', 'employee', 'vip', 'visitor'] }),
  field('status', 'enum', ['eq', 'neq', 'in', 'nin'], { label: 'Status', enumValues: ['active', 'inactive', 'suspended', 'terminated'] }),
  field('company_id', 'company', ['eq', 'neq', 'in', 'nin', 'is_null'], { label: 'Company' }),
  field('end_date', 'date', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null'], { label: 'End date' }),
  field('work_schedule_id', 'work_schedule', ['eq', 'neq', 'in', 'nin', 'is_null'], { label: 'Work schedule' }),
  field('on_shift_now', 'boolean', ['eq'], { label: 'On shift now (work schedule)' }),
  field('member_of_segment', 'segment', ['eq', 'neq', 'in', 'nin'], { label: 'Member of segment' }),
  field('visits_last_30d', 'integer', ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null'], { label: 'Visits (30 days)' }),
  field('avg_dwell_minutes', 'number', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null'], { label: 'Average visit length, minutes (30 days)' }),
  field('top_area_id', 'area', ['eq', 'neq', 'in', 'nin', 'is_null'], { label: 'Most visited area (30 days)' }),
  field('custom_fields.shift', 'enum', ['eq', 'neq', 'in', 'nin', 'is_null'], { label: 'Shift', enumValues: ['day', 'night'] }),
  field('first_seen_at', 'timestamp', ['gt', 'gte', 'lt', 'lte', 'between', 'is_null'], { label: 'First seen' }),
];

export const REFS: ConditionRefs = {
  companies: [{ id: ACME, name: 'Acme' }],
  work_schedules: [{ id: NIGHT, name: 'Night shift' }],
  areas: [{ id: LOBBY, name: 'Lobby', facility_id: TOWER }],
  facilities: [{ id: TOWER, name: 'Nova Tower' }],
  segments: [
    { id: VIPS, name: 'VIP guests', kind: 'manual', target: 'profiles' },
    { id: AUTO, name: 'Employees', kind: 'dynamic', target: 'profiles' },
    { id: FACES, name: 'Faces', kind: 'manual', target: 'identities' },
    { id: SELF, name: 'This one', kind: 'manual', target: 'profiles' },
  ],
};


/** The `SegmentConditionsCatalog` query's answer for {@link PROFILE_FIELDS} and {@link REFS}. */
export function catalogAnswer(): { readonly data: Record<string, unknown> } {
  return {
    data: {
      segment_fields: PROFILE_FIELDS.map((row) => ({
        field: row.field,
        value_type: row.type,
        operators: row.operators,
        enum_values: row.enumValues,
        label: row.label,
      })),
      ...REFS,
    },
  };
}
