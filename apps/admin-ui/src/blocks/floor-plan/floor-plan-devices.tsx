import type * as React from 'react';
import type { PlanDeviceRow } from '../../fields/plan-rows';
import { PlanShapeOutline } from '../../fields/plan-shape-outline';
import type { FloorPlanT } from './floor-plan-occupancy';
import { deviceHealthStyle, deviceIcon, healthTextKey } from './floor-plan-style';

export interface FloorPlanDevicesProps {
  /** The positioned devices drawn on this plan. */
  readonly devices: readonly PlanDeviceRow[];
  /** The marker size in plan pixels (the figure's icon unit). */
  readonly size: number;
  readonly t: FloorPlanT;
}

/**
 * The devices on a plan: each device's coverage as a faint outline, then a marker at its
 * position with its type's icon, ringed in its health colour and titled with its name and
 * health.
 */
export function FloorPlanDevices({ devices, size, t }: FloorPlanDevicesProps): React.ReactElement {
  return (
    <>
      {devices.map((device) =>
        device.coverage ? (
          <PlanShapeOutline
            key={`coverage:${device.id}`}
            shape={device.coverage}
            className="pointer-events-none fill-sky-400/10 stroke-sky-500/60 stroke-1 [stroke-dasharray:4_3]"
          />
        ) : null,
      )}
      {devices.map((device) => {
        if (!device.position) return null;
        const Icon = deviceIcon(device.device_type);
        const style = deviceHealthStyle(device.health_status);
        const [x, y] = device.position;
        return (
          <g key={device.id} data-testid={`floor-plan-device:${device.id}`}>
            <title>
              {t('device', { params: { name: device.name, health: t(healthTextKey(device.health_status)) } })}
            </title>
            <circle
              cx={x}
              cy={y}
              r={size * 0.75}
              className={`fill-background stroke-2 ${style.ring}`}
              vectorEffect="non-scaling-stroke"
            />
            <Icon
              x={x - size / 2}
              y={y - size / 2}
              width={size}
              height={size}
              className={style.icon}
              aria-hidden
            />
          </g>
        );
      })}
    </>
  );
}
