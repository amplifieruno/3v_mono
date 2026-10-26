import type {
  FloorPlanRow,
  PlanAccessPointRow,
  PlanAreaRow,
  PlanDeviceRow,
} from '../../fields/plan-rows';
import {
  type AreaLabel,
  type AreaToLabel,
  type LabelPlacement,
  type PointToLabel,
  markerBox,
  placeAreaLabels,
  placePointLabels,
} from './floor-plan-labels';
import { type FloorPlanT, occupancyText } from './floor-plan-occupancy';

/** Device types named on the plan; terminals and sensors are known by the access point they serve. */
const NAMED_DEVICE_TYPES = new Set(['static_video_camera', 'ptz_camera', 'thermal_camera']);

export interface PlanLabelsInput {
  readonly plan: FloorPlanRow;
  readonly areas: readonly PlanAreaRow[];
  readonly accessPoints: readonly PlanAccessPointRow[];
  readonly devices: readonly PlanDeviceRow[];
  readonly t: FloorPlanT;
  /** The area label font size and the marker label font size (plan pixels). */
  readonly font: number;
  readonly small: number;
  /** The radius of a marker's ring. */
  readonly radius: number;
}

export interface PlanLabels {
  /** Where each labelled area's name and occupancy go (not the plan's own area). */
  readonly areas: ReadonlyMap<string, AreaLabel>;
  /** The named markers (access points, cameras) and where their names go. */
  readonly points: readonly {
    readonly id: string;
    readonly text: string;
    readonly place: LabelPlacement;
  }[];
}

/** The floor plan's label placements: the areas' first, then the markers' names around them. */
export function planLabels({
  plan,
  areas,
  accessPoints,
  devices,
  t,
  font,
  small,
  radius,
}: PlanLabelsInput): PlanLabels {
  const markers = [...accessPoints, ...devices].flatMap((row) =>
    row.position ? [markerBox(row.position, radius)] : [],
  );
  const toLabel: AreaToLabel[] = areas.flatMap((area) =>
    area.shape && area.id !== plan.area_id
      ? [
          {
            id: area.id,
            path: area.path,
            shape: area.shape,
            lines: [area.name, occupancyText(area, t)],
          },
        ]
      : [],
  );
  const placed = placeAreaLabels(toLabel, markers, font);
  const named: PointToLabel[] = [
    ...accessPoints,
    ...devices.filter((device) => NAMED_DEVICE_TYPES.has(device.device_type)),
  ].flatMap((row) =>
    row.position ? [{ id: row.id, position: row.position, text: row.name }] : [],
  );
  const points = placePointLabels(named, markers, placed.boxes, radius, small, plan.size);
  return {
    areas: placed.placements,
    points: named.flatMap((point) => {
      const place = points.get(point.id);
      return place ? [{ id: point.id, text: point.text, place }] : [];
    }),
  };
}
