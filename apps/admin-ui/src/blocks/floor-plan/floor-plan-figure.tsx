import type * as React from 'react';
import { PlanCanvas } from '../../fields/plan-canvas';
import type {
  FloorPlanRow,
  PlanAccessPointRow,
  PlanAreaRow,
  PlanDeviceRow,
} from '../../fields/plan-rows';
import { PlanShapeOutline } from '../../fields/plan-shape-outline';
import { FloorPlanDevices } from './floor-plan-devices';
import { type FloorPlanT, isOverCapacity, occupancyText } from './floor-plan-occupancy';
import { planLabels } from './floor-plan-placement';
import { accessLevelStyle, accessPointIcon } from './floor-plan-style';

export interface FloorPlanFigureProps {
  readonly plan: FloorPlanRow;
  /** The areas with a shape on this plan, outer ones first (path order). */
  readonly areas: readonly PlanAreaRow[];
  readonly accessPoints: readonly PlanAccessPointRow[];
  /** The positioned devices on this plan; absent draws none. */
  readonly devices?: readonly PlanDeviceRow[];
  /** How an area's shape is filled and outlined; by access level when absent. */
  readonly shapeClassOf?: (area: PlanAreaRow) => string;
  readonly t: FloorPlanT;
}

const byAccessLevel = (area: PlanAreaRow): string => accessLevelStyle(area.access_level).shape;

/**
 * The plan's image with its areas' shapes (outer ones under inner ones, coloured by access
 * level or as `shapeClassOf` says, outlined red when over capacity), each labelled with its name and occupancy, and
 * the access points and devices as icons at their positions, the access points and cameras
 * named beside their icons. Labels are placed apart from each other and from the icons
 * (`./floor-plan-labels.ts`).
 */
export function FloorPlanFigure({
  plan,
  areas,
  accessPoints,
  devices = [],
  shapeClassOf = byAccessLevel,
  t,
}: FloorPlanFigureProps): React.ReactElement {
  const unit = Math.max(plan.size.width, plan.size.height);
  const font = unit / 70;
  const icon = unit / 45;
  const small = unit / 100;
  const labels = planLabels({
    plan,
    areas,
    accessPoints,
    devices,
    t,
    font,
    small,
    radius: icon * 0.75,
  });
  return (
    <PlanCanvas
      size={plan.size}
      imageFileId={plan.image_file_id}
      label={t('drawing', { params: { name: plan.name } })}
      testId="floor-plan-drawing"
    >
      {areas.map((area) =>
        area.shape ? (
          <PlanShapeOutline
            key={area.id}
            shape={area.shape}
            title={`${area.name}: ${occupancyText(area, t)}`}
            className={`${shapeClassOf(area)} ${isOverCapacity(area) ? 'stroke-destructive stroke-[3]' : 'stroke-2'}`}
          />
        ) : null,
      )}
      {areas.map((area) => {
        const label = labels.areas.get(area.id);
        if (label === undefined) return null;
        const { x, y } = label.place;
        // One line ("name · occupancy") where the stacked label does not fit.
        const stacked = label.lines.length > 1;
        return (
          <text
            key={area.id}
            x={x}
            y={y}
            fontSize={font}
            textAnchor="middle"
            data-testid={`floor-plan-label:${area.id}`}
            className="pointer-events-none fill-foreground stroke-background font-medium [paint-order:stroke]"
            strokeWidth={font / 4}
          >
            <tspan x={x}>{stacked ? area.name : `${area.name} · `}</tspan>
            <tspan
              x={stacked ? x : undefined}
              dy={stacked ? font * 1.2 : undefined}
              className={isOverCapacity(area) ? 'fill-destructive' : undefined}
            >
              {occupancyText(area, t)}
            </tspan>
          </text>
        );
      })}
      <FloorPlanDevices devices={devices} size={icon} t={t} />
      {accessPoints.map((point) => {
        if (!point.position) return null;
        const Icon = accessPointIcon(point.kind);
        const [x, y] = point.position;
        return (
          <g key={point.id} data-testid={`floor-plan-access-point:${point.id}`}>
            <title>{point.name}</title>
            <circle
              cx={x}
              cy={y}
              r={icon * 0.75}
              className="fill-background stroke-primary stroke-2"
              vectorEffect="non-scaling-stroke"
            />
            <Icon
              x={x - icon / 2}
              y={y - icon / 2}
              width={icon}
              height={icon}
              className="text-primary"
              aria-hidden
            />
          </g>
        );
      })}
      {labels.points.map(({ id, text, place }) => (
        <text
          key={id}
          x={place.x}
          y={place.y}
          fontSize={small}
          textAnchor={place.anchor}
          data-testid={`floor-plan-point-label:${id}`}
          className="pointer-events-none fill-foreground stroke-background [paint-order:stroke]"
          strokeWidth={small / 4}
        >
          {text}
        </text>
      ))}
    </PlanCanvas>
  );
}
