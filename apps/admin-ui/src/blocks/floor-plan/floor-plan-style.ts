import {
  ArrowLeftRight,
  ArrowUpDown,
  Cctv,
  ConciergeBell,
  DoorOpen,
  Fence,
  type LucideIcon,
  RadioTower,
  ScanFace,
  Thermometer,
  Video,
} from 'lucide-react';

/** How an area's shape is filled and outlined, by access level (class names must be literal). */
const ACCESS_LEVEL_CLASSES: Readonly<
  Record<string, { readonly shape: string; readonly swatch: string }>
> = {
  public: { shape: 'fill-emerald-500/15 stroke-emerald-600', swatch: 'bg-emerald-500' },
  restricted: { shape: 'fill-amber-400/20 stroke-amber-600', swatch: 'bg-amber-400' },
  secure: { shape: 'fill-orange-500/20 stroke-orange-600', swatch: 'bg-orange-500' },
  classified: { shape: 'fill-red-500/20 stroke-red-700', swatch: 'bg-red-600' },
};

const UNKNOWN_LEVEL = {
  shape: 'fill-slate-400/15 stroke-slate-500',
  swatch: 'bg-slate-400',
} as const;

/** The shape and legend swatch classes of an access level. */
export const accessLevelStyle = (
  level: string | null,
): { readonly shape: string; readonly swatch: string } =>
  (level === null ? undefined : ACCESS_LEVEL_CLASSES[level]) ?? UNKNOWN_LEVEL;

/** The icon of an access point by kind (`access_point_kinds`). */
const KIND_ICONS: Readonly<Record<string, LucideIcon>> = {
  door: DoorOpen,
  turnstile: ArrowLeftRight,
  gate: Fence,
  elevator: ArrowUpDown,
  reception: ConciergeBell,
};

export const accessPointIcon = (kind: string): LucideIcon => KIND_ICONS[kind] ?? DoorOpen;

/** The icon of a device by type (`device_types`). */
const DEVICE_ICONS: Readonly<Record<string, LucideIcon>> = {
  static_video_camera: Cctv,
  ptz_camera: Video,
  thermal_camera: Thermometer,
  access_terminal: ScanFace,
  sensor: RadioTower,
};

export const deviceIcon = (type: string): LucideIcon => DEVICE_ICONS[type] ?? RadioTower;

interface HealthStyle {
  readonly ring: string;
  readonly icon: string;
}

const UNKNOWN_HEALTH: HealthStyle = { ring: 'stroke-slate-400', icon: 'text-slate-500' };

/** A device marker's ring and icon colour by health (`device_health_statuses`; literal classes). */
const HEALTH_CLASSES: Readonly<Record<string, HealthStyle>> = {
  healthy: { ring: 'stroke-emerald-600', icon: 'text-emerald-700' },
  warning: { ring: 'stroke-amber-500', icon: 'text-amber-600' },
  critical: { ring: 'stroke-destructive', icon: 'text-destructive' },
  unknown: UNKNOWN_HEALTH,
};

export const deviceHealthStyle = (health: string): HealthStyle =>
  HEALTH_CLASSES[health] ?? UNKNOWN_HEALTH;

/** The block text key naming a health status (an unknown value reads as Unknown). */
export const healthTextKey = (health: string): string =>
  Object.hasOwn(HEALTH_CLASSES, health) ? `health_${health}` : 'health_unknown';
