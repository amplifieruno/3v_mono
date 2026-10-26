import {
  type PlanBounds,
  type PlanPoint,
  type PlanShape,
  type PlanSize,
  outerRing,
  shapeBounds,
  shapeLabelPoint,
} from '../../fields/plan-geometry';

/**
 * Where the floor plan's labels go (plan pixels). Text is not measured: a line is taken as
 * `LINE_WIDTH` of the font size per character, wide enough for the console's sans font.
 *
 * - An area's name and occupancy go at the free spot of its shape nearest the shape's middle:
 *   off the markers, off the labels placed before it, and preferably off the shapes of the
 *   other areas inside or overlapping it (its ancestors excepted), so nested and overlapping
 *   shapes keep their labels apart.
 * - A marker's name goes beside its icon (right, left, above or below, then the corners),
 *   on the first side that is free of the other markers and labels and stays on the plan.
 */

const LINE_WIDTH = 0.6;
const LINE_HEIGHT = 1.2;
/** The most grid steps across an area's shape when looking for a free spot (finer steps are half a line). */
const MAX_STEPS = 60;
/** Weight of a square pixel covering a marker or a placed label, against one sample point lying in another area's shape. */
const HARD = 1000;

export type LabelBox = PlanBounds;

export interface AreaToLabel {
  readonly id: string;
  /** Ids from the top-level area down to this one (`areas.path`). */
  readonly path: readonly string[];
  readonly shape: PlanShape;
  readonly lines: readonly string[];
}

export interface PointToLabel {
  readonly id: string;
  readonly position: PlanPoint;
  readonly text: string;
}

/** Where a text goes: the anchor of its first baseline and the SVG `text-anchor`. */
export interface LabelPlacement {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
}

/** An area's label: where it goes and its lines (stacked, or joined on one). */
export interface AreaLabel {
  readonly place: LabelPlacement;
  readonly lines: readonly string[];
}

const textWidth = (lines: readonly string[], font: number): number =>
  Math.max(0, ...lines.map((line) => line.length)) * font * LINE_WIDTH;

/** The box of a text whose first baseline starts at `y`. */
function textBox(place: LabelPlacement, lines: readonly string[], font: number): LabelBox {
  const width = textWidth(lines, font);
  const minX =
    place.anchor === 'start'
      ? place.x
      : place.anchor === 'end'
        ? place.x - width
        : place.x - width / 2;
  return {
    minX,
    maxX: minX + width,
    minY: place.y - font * 0.95,
    maxY: place.y + font * (LINE_HEIGHT * (lines.length - 1) + 0.35),
  };
}

const overlap = (a: LabelBox, b: LabelBox): number =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

const covered = (box: LabelBox, others: readonly LabelBox[]): number =>
  others.reduce((sum, other) => sum + overlap(box, other), 0);

/** Whether a point lies inside a shape (a polygon's outline by ray casting, a circle's disc). */
export function insideShape(point: PlanPoint, shape: PlanShape): boolean {
  const [x, y] = point;
  if (shape.type === 'Circle') {
    return Math.hypot(x - shape.center[0], y - shape.center[1]) <= shape.radius;
  }
  const ring = outerRing(shape);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as PlanPoint;
    const [xj, yj] = ring[j] as PlanPoint;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Sample points across a box (5 × 3), to tell how much of it lies in a shape. */
function samples(box: LabelBox): PlanPoint[] {
  const points: PlanPoint[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      points.push([
        box.minX + ((box.maxX - box.minX) * i) / 4,
        box.minY + ((box.maxY - box.minY) * j) / 2,
      ]);
    }
  }
  return points;
}

/** The box a marker's icon takes, `radius` around its position. */
export const markerBox = ([x, y]: PlanPoint, radius: number): LabelBox => ({
  minX: x - radius,
  minY: y - radius,
  maxX: x + radius,
  maxY: y + radius,
});

/** The candidate anchors of an area's label: a grid over its bounds, nearest the middle first. */
function areaCandidates(shape: PlanShape, font: number): PlanPoint[] {
  const box = shapeBounds(shape);
  const [cx, cy] = shapeLabelPoint(shape);
  const dx = Math.max(font / 2, (box.maxX - box.minX) / MAX_STEPS);
  const dy = Math.max(font / 2, (box.maxY - box.minY) / MAX_STEPS);
  const points: PlanPoint[] = [[cx, cy]];
  for (let x = box.minX; x <= box.maxX; x += dx) {
    for (let y = box.minY; y <= box.maxY; y += dy) points.push([x, y]);
  }
  const away = ([x, y]: PlanPoint): number => Math.hypot(x - cx, y - cy);
  return points.sort((a, b) => away(a) - away(b));
}

interface Spot {
  readonly place: LabelPlacement;
  readonly lines: readonly string[];
  readonly box: LabelBox;
  readonly cost: number;
}

/** The cheapest spot for the lines in the area whose whole box lies in its shape, if any. */
function cheapestSpot(
  area: AreaToLabel,
  lines: readonly string[],
  others: readonly AreaToLabel[],
  taken: readonly LabelBox[],
  font: number,
): Spot | null {
  const lift = (font * LINE_HEIGHT * (lines.length - 1)) / 2;
  let best: Spot | null = null;
  for (const [x, y] of areaCandidates(area.shape, font)) {
    const place: LabelPlacement = { x, y: y - lift + font * 0.3, anchor: 'middle' };
    const box = textBox(place, lines, font);
    const points = samples(box);
    if (!points.every((point) => insideShape(point, area.shape))) continue;
    const cost =
      HARD * covered(box, taken) +
      points.filter((point) => others.some((other) => insideShape(point, other.shape))).length;
    if (best === null || cost < best.cost) best = { place, lines, box, cost };
    if (cost === 0) break;
  }
  return best;
}

/**
 * The label of each area, placed in order (outer areas first): its lines stacked at the
 * cheapest spot, or joined on one line when that fits a narrower free strip (a parent whose
 * rooms fill it) more cheaply; the shape's middle when neither fits inside it.
 */
export function placeAreaLabels(
  areas: readonly AreaToLabel[],
  markers: readonly LabelBox[],
  font: number,
): { readonly placements: ReadonlyMap<string, AreaLabel>; readonly boxes: LabelBox[] } {
  const placements = new Map<string, AreaLabel>();
  const boxes: LabelBox[] = [];
  for (const area of areas) {
    const others = areas.filter((other) => other.id !== area.id && !area.path.includes(other.id));
    const taken = [...markers, ...boxes];
    let best = cheapestSpot(area, area.lines, others, taken, font);
    if (area.lines.length > 1 && (best === null || best.cost > 0)) {
      const single = cheapestSpot(area, [area.lines.join(' · ')], others, taken, font);
      if (single !== null && (best === null || single.cost < best.cost)) best = single;
    }
    if (best === null) {
      const [x, y] = shapeLabelPoint(area.shape);
      const place: LabelPlacement = { x, y, anchor: 'middle' };
      best = { place, lines: area.lines, box: textBox(place, area.lines, font), cost: 0 };
    }
    placements.set(area.id, { place: best.place, lines: best.lines });
    boxes.push(best.box);
  }
  return { placements, boxes };
}

/** The sides a marker's label tries, in order, just off an icon of `radius`. */
function pointCandidates([x, y]: PlanPoint, radius: number, font: number): LabelPlacement[] {
  const side = radius + font * 0.5;
  const middle = y + font * 0.3;
  return [
    { x: x + side, y: middle, anchor: 'start' },
    { x: x - side, y: middle, anchor: 'end' },
    { x, y: y - side - font * 0.25, anchor: 'middle' },
    { x, y: y + side + font * 0.8, anchor: 'middle' },
    { x: x + side * 0.7, y: y - side * 0.7, anchor: 'start' },
    { x: x - side * 0.7, y: y - side * 0.7, anchor: 'end' },
    { x: x + side * 0.7, y: y + side * 0.7 + font * 0.8, anchor: 'start' },
    { x: x - side * 0.7, y: y + side * 0.7 + font * 0.8, anchor: 'end' },
  ];
}

/** A marker label cut by the plan's edge is worse than one over a neighbour. */
const OFF_PLAN = 10;

const offPlan = (box: LabelBox, size: PlanSize): number =>
  (box.maxX - box.minX) * (box.maxY - box.minY) -
  overlap(box, { minX: 0, minY: 0, maxX: size.width, maxY: size.height });

/** The label of each marker on the side covering the least of the markers and the labels, kept on the plan. */
export function placePointLabels(
  points: readonly PointToLabel[],
  markers: readonly LabelBox[],
  taken: readonly LabelBox[],
  radius: number,
  font: number,
  size: PlanSize,
): ReadonlyMap<string, LabelPlacement> {
  const placements = new Map<string, LabelPlacement>();
  const boxes = [...taken];
  for (const point of points) {
    let best: { place: LabelPlacement; box: LabelBox; cost: number } | null = null;
    for (const place of pointCandidates(point.position, radius, font)) {
      const box = textBox(place, [point.text], font);
      const cost = covered(box, [...markers, ...boxes]) + OFF_PLAN * offPlan(box, size);
      if (best === null || cost < best.cost) best = { place, box, cost };
      if (cost === 0) break;
    }
    if (best === null) continue;
    placements.set(point.id, best.place);
    boxes.push(best.box);
  }
  return placements;
}
