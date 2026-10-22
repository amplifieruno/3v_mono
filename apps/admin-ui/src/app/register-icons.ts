import { hasIcon, type IconComponent, registerIcons } from '@burojs/ui-shadcn';
import {
  Activity,
  Ban,
  Bell,
  Briefcase,
  Building,
  Building2,
  CalendarClock,
  Cctv,
  ChartBar,
  CircleQuestionMark,
  CircleStop,
  DoorOpen,
  Gauge,
  HeartPulse,
  History,
  IdCard,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  ListPlus,
  ListTree,
  MailPlus,
  Map as MapIcon,
  MapPin,
  MonitorPlay,
  ScanFace,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { NAV_ICONS } from './nav';

/** Every icon `NAV_ICONS` names, by its lucide name. */
const LUCIDE_NAV_ICONS: Readonly<Record<string, IconComponent>> = {
  Activity,
  Ban,
  Bell,
  Briefcase,
  Building,
  Building2,
  CalendarClock,
  Cctv,
  ChartBar,
  CircleQuestionMark,
  CircleStop,
  DoorOpen,
  Gauge,
  HeartPulse,
  History,
  IdCard,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  ListPlus,
  ListTree,
  MailPlus,
  Map: MapIcon,
  MapPin,
  MonitorPlay,
  ScanFace,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
};

/**
 * Registers the navigation icons the kit does not ship (a name it already
 * ships keeps the kit's glyph). Call once at boot, before the shell renders.
 */
export const registerNavIcons = (): void => {
  const missing = Object.fromEntries(
    Object.values(NAV_ICONS)
      .filter((name) => !hasIcon(name))
      .flatMap((name) => {
        const icon = LUCIDE_NAV_ICONS[name];
        return icon === undefined ? [] : [[name, icon] as const];
      }),
  );
  registerIcons(missing);
};
