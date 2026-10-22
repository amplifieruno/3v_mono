import {
  type PlanShape,
  type PlanSize,
  parsePoint,
  parseShape,
  type PlanPoint,
} from './plan-geometry';

/**
 * Rows of the plan-space resources as the plan inputs and the floor-plan block read them,
 * parsed from untyped list rows. The resources are read by name (`src/data/resource-names.ts`),
 * not imported, because the places module's resources import these fields.
 */
export interface FloorPlanRow {
  readonly id: string;
  readonly facility_id: string;
  /** The area the plan belongs to (a floor, a parking level, a lobby). */
  readonly area_id: string;
  readonly name: string;
  readonly image_file_id: string | null;
  readonly size: PlanSize;
}

export interface PlanAreaRow {
  readonly id: string;
  readonly name: string;
  /** Ids from the top-level area down to this one, inclusive (`areas.path`). */
  readonly path: readonly string[];
  readonly shape: PlanShape | null;
  readonly access_level: string | null;
  readonly capacity: number | null;
  readonly current_occupancy: number | null;
}

export interface PlanAccessPointRow {
  readonly id: string;
  /** The area it leads into; its plan (or the nearest enclosing area's) is the one it is drawn on. */
  readonly area_id: string | null;
  readonly name: string;
  readonly kind: string;
  readonly position: PlanPoint | null;
}

type Row = Readonly<Record<string, unknown>>;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** A `floor_plans` row, or `null` when it lacks its keys or a positive image size. */
export function floorPlanOf(row: Row | null | undefined): FloorPlanRow | null {
  if (!row) return null;
  const id = text(row.id);
  const facility = text(row.facility_id);
  const area = text(row.area_id);
  const width = count(row.width_px);
  const height = count(row.height_px);
  if (!id || !facility || !area || !width || !height || width <= 0 || height <= 0) return null;
  return {
    id,
    facility_id: facility,
    area_id: area,
    name: text(row.name) ?? '',
    image_file_id: text(row.image_file_id),
    size: { width, height },
  };
}

/** An `areas` row with its path and parsed shape, or `null` without an id. */
export function planAreaOf(row: Row): PlanAreaRow | null {
  const id = text(row.id);
  if (!id) return null;
  const path = Array.isArray(row.path)
    ? row.path.filter((step): step is string => typeof step === 'string')
    : [id];
  return {
    id,
    name: text(row.name) ?? '',
    path,
    shape: parseShape(row.shape),
    access_level: text(row.access_level),
    capacity: count(row.capacity),
    current_occupancy: count(row.current_occupancy),
  };
}

/** An `access_points` row with its parsed position, or `null` without an id. */
export function planAccessPointOf(row: Row): PlanAccessPointRow | null {
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    area_id: text(row.area_id),
    name: text(row.name) ?? '',
    kind: text(row.kind) ?? 'door',
    position: parsePoint(row.position),
  };
}

/** Parses each row with `parse`, dropping the ones it refuses. */
export function rowsOf<T>(rows: unknown, parse: (row: Row) => T | null): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (row === null || typeof row !== 'object') return [];
    const parsed = parse(row as Row);
    return parsed === null ? [] : [parsed];
  });
}

/**
 * The areas drawn on `plan`: the shaped areas whose nearest plan outwards (the area's own
 * first, `planOfChain`) is this one. An area inside the plan's area that carries a plan of its
 * own, or lies inside a nearer one, is drawn in that plan's pixels and so is left out here.
 * `plans` are the facility's plans (the plan itself counts even if missing from them).
 */
export function areasOnPlan(
  areas: readonly PlanAreaRow[],
  plan: FloorPlanRow,
  plans: readonly FloorPlanRow[],
): PlanAreaRow[] {
  const known = plans.some((candidate) => candidate.id === plan.id) ? plans : [...plans, plan];
  return areas.filter(
    (area) =>
      area.shape !== null &&
      area.path.includes(plan.area_id) &&
      planOfChain([...area.path].reverse(), known)?.id === plan.id,
  );
}

/**
 * The positioned access points drawn on `plan`: those whose area's nearest plan outwards (the
 * area itself first) is this one, the way the position input resolves the plan to click on.
 */
export function accessPointsOnPlan(
  points: readonly PlanAccessPointRow[],
  areas: readonly PlanAreaRow[],
  plan: FloorPlanRow,
  plans: readonly FloorPlanRow[],
): PlanAccessPointRow[] {
  const known = plans.some((candidate) => candidate.id === plan.id) ? plans : [...plans, plan];
  return points.filter(
    (point) =>
      point.position !== null &&
      point.area_id !== null &&
      planOfChain(areaChain(null, point.area_id, areas), known)?.id === plan.id,
  );
}

/**
 * The plan a place lies on: the first of `chain` (ids from the place outwards) that carries a
 * floor plan. The data layer's rule (`create_floor_plans`): an area or device finds its plan
 * through its nearest enclosing area with one, the area itself first.
 */
export function planOfChain(
  chain: readonly string[],
  plans: readonly FloorPlanRow[],
): FloorPlanRow | null {
  for (const id of chain) {
    const plan = plans.find((candidate) => candidate.area_id === id);
    if (plan) return plan;
  }
  return null;
}

/**
 * The ids from a place outwards: `selfId` (the area being edited, if any), then `startId` (the
 * area it sits in) and that area's ancestors, nearest first, as its path in `areas` gives them.
 */
export function areaChain(
  selfId: string | null,
  startId: string | null,
  areas: readonly PlanAreaRow[],
): string[] {
  const chain: string[] = selfId ? [selfId] : [];
  if (!startId) return chain;
  const start = areas.find((area) => area.id === startId);
  const outwards = start ? [...start.path].reverse() : [startId];
  for (const id of outwards) if (!chain.includes(id)) chain.push(id);
  return chain;
}
