import { z } from 'zod';
import type { StackPart } from '../charts/stacked-bar';
import { DEVICE_HEALTH_STATUSES } from '../../enums/devices';

/** One device as the summary reads it. */
export const deviceRow = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  health_status: z.string(),
  last_seen_at: z.string().nullable(),
  facility: z.object({ name: z.string() }).nullable(),
});

export type DeviceRow = z.infer<typeof deviceRow>;

const HEALTH_COLOURS: Readonly<Record<(typeof DEVICE_HEALTH_STATUSES)[number], { fill: string; swatch: string }>> = {
  healthy: { fill: 'fill-success', swatch: 'bg-success' },
  warning: { fill: 'fill-warning', swatch: 'bg-warning' },
  critical: { fill: 'fill-destructive', swatch: 'bg-destructive' },
  unknown: { fill: 'fill-muted-foreground/40', swatch: 'bg-muted-foreground/40' },
};

/** The devices per health status, as the parts of one bar (every status, zeros kept for the legend), named by `labelOf`. */
export function healthParts(devices: readonly DeviceRow[], labelOf: (status: string) => string): StackPart[] {
  return DEVICE_HEALTH_STATUSES.map((status) => ({
    key: status,
    label: labelOf(status),
    value: devices.filter((device) => device.health_status === status).length,
    ...HEALTH_COLOURS[status],
  }));
}

/** How urgent a device is: 0 offline or unreachable, 1 marked faulty, 2 warning, `null` for a well one. */
export function urgencyOf(device: DeviceRow): number | null {
  if (device.health_status === 'critical' || device.status === 'connection_error') return 0;
  if (device.status === 'error') return 1;
  if (device.health_status === 'warning') return 2;
  return null;
}

/** The devices needing attention, most urgent first, then the longest unseen, then by name. */
export function devicesNeedingAttention(devices: readonly DeviceRow[]): DeviceRow[] {
  const seen = (device: DeviceRow) => (device.last_seen_at === null ? 0 : Date.parse(device.last_seen_at));
  return devices
    .filter((device) => urgencyOf(device) !== null)
    .sort((a, b) => (urgencyOf(a) ?? 3) - (urgencyOf(b) ?? 3) || seen(a) - seen(b) || a.name.localeCompare(b.name));
}
