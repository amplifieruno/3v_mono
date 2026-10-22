import type { PairProfile } from './profile-pair';

/** The compared fields, in order; each is a row of the comparison with its label key. */
export const COMPARED_FIELDS = [
  'name',
  'profile_type',
  'status',
  'email',
  'phone',
  'company',
  'employee_id',
  'department',
  'job_title',
  'start_date',
  'end_date',
  'identities',
  'documents',
  'consents',
  'created_at',
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

/** One compared value as text (`null` for nothing stored). */
export function comparedValue(profile: PairProfile, field: ComparedField): string | null {
  if (field === 'name') return `${profile.first_name} ${profile.last_name}`.trim();
  if (field === 'created_at') return profile.created_at.slice(0, 10);
  const value = profile[field];
  return value === null ? null : String(value);
}

/** Two values differ when, trimmed and case-folded, they are not equal (both empty are equal). */
export function valuesDiffer(a: string | null, b: string | null): boolean {
  const norm = (v: string | null): string => (v ?? '').trim().toLocaleLowerCase();
  return norm(a) !== norm(b);
}

export interface ComparedRow {
  readonly field: ComparedField;
  readonly first: string | null;
  readonly second: string | null;
  readonly differs: boolean;
}

/** The comparison's rows. Counts and the creation day are facts, never marked as differing. */
export function compareRows(first: PairProfile, second: PairProfile): ComparedRow[] {
  const facts: readonly ComparedField[] = ['identities', 'documents', 'consents', 'created_at'];
  return COMPARED_FIELDS.map((field) => {
    const a = comparedValue(first, field);
    const b = comparedValue(second, field);
    return { field, first: a, second: b, differs: !facts.includes(field) && valuesDiffer(a, b) };
  });
}
