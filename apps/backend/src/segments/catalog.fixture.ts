import type { CatalogField, EvaluationContext } from './types.js';

/** Test copy of itap.segment_field_catalog (the integration suite checks the live catalog translates fully). */
const TEXT = ['eq', 'neq', 'in', 'nin', 'contains'];
const INTEGER = ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between'];
const NUMBER = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'];
const DATE = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'];
const TIMESTAMP = ['gt', 'gte', 'lt', 'lte', 'between'];
const REF = ['eq', 'neq', 'in', 'nin'];
const PATH = ['eq', 'neq', 'in', 'nin', 'is_null'];
const nullable = (ops: string[]): string[] => [...ops, 'is_null'];
const f = (field: string, value_type: string, operators: string[], enum_values: string[] | null = null): CatalogField => ({
  field,
  value_type,
  operators,
  enum_values,
});

const behavioral: CatalogField[] = [
  f('visits_last_30d', 'integer', nullable(INTEGER)),
  f('avg_dwell_minutes', 'number', nullable(NUMBER)),
  f('last_seen_days_ago', 'integer', nullable(INTEGER)),
  f('after_hours_visits_30d', 'integer', nullable(INTEGER)),
  f('top_area_id', 'area', nullable(REF)),
];

export const profileCatalog: CatalogField[] = [
  f('first_name', 'text', TEXT),
  f('last_name', 'text', TEXT),
  f('email', 'text', nullable(TEXT)),
  f('department', 'text', nullable(TEXT)),
  f('profile_type', 'enum', REF, ['contractor', 'employee', 'visitor']),
  f('status', 'enum', REF, ['active', 'inactive']),
  f('company_id', 'company', nullable(REF)),
  f('start_date', 'date', nullable(DATE)),
  f('end_date', 'date', nullable(DATE)),
  f('work_schedule_id', 'work_schedule', nullable(REF)),
  f('on_shift_now', 'boolean', ['eq']),
  f('has_face', 'boolean', ['eq']),
  f('is_blacklisted', 'boolean', ['eq']),
  f('visit_status_today', 'enum', nullable(REF), ['checked_in', 'scheduled']),
  f('member_of_segment', 'segment', REF),
  f('custom_fields.badge', 'text', PATH),
  f('custom_fields.vip', 'boolean', ['eq', 'is_null']),
  ...behavioral,
];

export const identityCatalog: CatalogField[] = [
  f('status', 'enum', REF, ['active', 'merged', 'unknown']),
  f('age', 'integer', nullable(INTEGER)),
  f('attributes.gender', 'text', PATH),
  f('first_seen_at', 'timestamp', nullable(TIMESTAMP)),
  f('detection_count', 'integer', INTEGER),
  f('linked', 'boolean', ['eq']),
  f('member_of_segment', 'segment', REF),
  ...behavioral,
];

export const context: EvaluationContext = {
  at: '2026-10-19T12:00:00.000Z',
  localDate: '2026-10-19',
  dayStart: '2026-10-18T22:00:00.000Z',
  dayEnd: '2026-10-19T22:00:00.000Z',
  onShiftScheduleIds: ['00000000-0000-4000-8000-00000000000a'],
};
