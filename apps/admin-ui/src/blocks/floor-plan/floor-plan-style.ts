import {
  ArrowLeftRight,
  ArrowUpDown,
  ConciergeBell,
  DoorOpen,
  Fence,
  type LucideIcon,
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
