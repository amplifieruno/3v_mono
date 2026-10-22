/**
 * The records a condition can name (`itap.segment_reference_valid`): companies, work schedules and
 * areas of the organization, and its manual segments of the same target (never the segment itself).
 */
import type { ReferenceType } from './segment-conditions-operators';

export interface NamedRow {
  readonly id: string;
  readonly name: string;
}

export interface SegmentRow extends NamedRow {
  readonly kind: string;
  readonly target: string;
}

export interface ConditionRefs {
  readonly companies: readonly NamedRow[];
  readonly work_schedules: readonly NamedRow[];
  readonly areas: readonly (NamedRow & { readonly facility_id: string })[];
  readonly facilities: readonly NamedRow[];
  readonly segments: readonly SegmentRow[];
}

/** Whether two uuids name the same record (the database compares uuids, not their spelling). */
export const sameId = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Every row of a reference type, whatever it may be chosen for. */
export function rowsOf(type: ReferenceType, refs: ConditionRefs): readonly NamedRow[] {
  if (type === 'company') return refs.companies;
  if (type === 'work_schedule') return refs.work_schedules;
  if (type === 'area') return refs.areas;
  return refs.segments;
}

/** The segments a `member_of_segment` condition may name: manual, of the same target, not this one. */
export function segmentChoices(refs: ConditionRefs, target: string | undefined, self: string | undefined): SegmentRow[] {
  return refs.segments.filter(
    (row) => row.kind === 'manual' && row.target === target && (self === undefined || !sameId(row.id, self)),
  );
}

/** A record's name; an area with its facility (`Lobby (Nova Tower)`). */
export function referenceName(type: ReferenceType, id: string, refs: ConditionRefs): string | undefined {
  if (type === 'area') {
    const area = refs.areas.find((row) => sameId(row.id, id));
    if (area === undefined) return undefined;
    const facility = refs.facilities.find((row) => sameId(row.id, area.facility_id));
    return facility === undefined ? area.name : `${area.name} (${facility.name})`;
  }
  return rowsOf(type, refs).find((row) => sameId(row.id, id))?.name;
}

/** The choices of a reference picker: the records the type may name, by name. */
export function referenceChoices(
  type: ReferenceType,
  refs: ConditionRefs,
  target: string | undefined,
  self: string | undefined,
): { readonly value: string; readonly label: string }[] {
  const rows = type === 'segment' ? segmentChoices(refs, target, self) : rowsOf(type, refs);
  return rows.map((row) => ({ value: row.id, label: referenceName(type, row.id, refs) ?? row.name }));
}
