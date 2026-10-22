import { defineSection } from '@burojs/core';

/**
 * Icon names for the navigation and the actions: lucide component names. Strings keep the
 * declarations serializable; `@burojs/ui-shadcn` resolves them through its
 * icon registry, and the names it does not ship are registered by
 * `./register-icons.ts`.
 */
export const NAV_ICONS = {
  dashboard: 'LayoutDashboard',
  help: 'CircleQuestionMark',
  overview: 'Gauge',
  organization: 'Building2',
  places: 'MapPin',
  devices: 'Cctv',
  people: 'Users',
  monitoring: 'Activity',
  notifications: 'Bell',
  analytics: 'ChartBar',
  access: 'DoorOpen',
  compliance: 'ShieldCheck',
  members: 'Users',
  invitations: 'MailPlus',
  invite: 'UserPlus',
  revoke: 'Ban',
  settings: 'Settings',
} as const;

/**
 * The sidebar sections, one per functional area of the console. A section is
 * grouping only: resources and pages keep their own paths. Every area is
 * declared here so later phases only register what they fill; this phase
 * registers `overview` and `organization`.
 */
export const NAV_SECTIONS = {
  overview: 'overview',
  organization: 'organization',
  places: 'places',
  devices: 'devices',
  people: 'people',
  monitoring: 'monitoring',
  notifications: 'notifications',
  analytics: 'analytics',
  access: 'access',
  compliance: 'compliance',
} as const;

export type NavSectionName = (typeof NAV_SECTIONS)[keyof typeof NAV_SECTIONS];

export const overviewSection = defineSection({
  name: NAV_SECTIONS.overview,
  icon: NAV_ICONS.overview,
  texts: 'Overview',
  order: 0,
});

export const organizationSection = defineSection({
  name: NAV_SECTIONS.organization,
  icon: NAV_ICONS.organization,
  texts: 'Organization',
  order: 10,
  collapsible: true,
  defaultOpen: true,
});

export const placesSection = defineSection({
  name: NAV_SECTIONS.places,
  icon: NAV_ICONS.places,
  texts: 'Places',
  order: 20,
  collapsible: true,
});

export const devicesSection = defineSection({
  name: NAV_SECTIONS.devices,
  icon: NAV_ICONS.devices,
  texts: 'Devices',
  order: 30,
  collapsible: true,
});

export const peopleSection = defineSection({
  name: NAV_SECTIONS.people,
  icon: NAV_ICONS.people,
  texts: 'People',
  order: 40,
  collapsible: true,
});

export const monitoringSection = defineSection({
  name: NAV_SECTIONS.monitoring,
  icon: NAV_ICONS.monitoring,
  texts: 'Monitoring',
  order: 50,
  collapsible: true,
});

export const notificationsSection = defineSection({
  name: NAV_SECTIONS.notifications,
  icon: NAV_ICONS.notifications,
  texts: 'Notifications',
  order: 60,
  collapsible: true,
});

export const analyticsSection = defineSection({
  name: NAV_SECTIONS.analytics,
  icon: NAV_ICONS.analytics,
  texts: 'Analytics',
  order: 70,
  collapsible: true,
});

export const accessSection = defineSection({
  name: NAV_SECTIONS.access,
  icon: NAV_ICONS.access,
  texts: 'Access control',
  order: 80,
  collapsible: true,
});

export const complianceSection = defineSection({
  name: NAV_SECTIONS.compliance,
  icon: NAV_ICONS.compliance,
  texts: 'Compliance',
  order: 90,
  collapsible: true,
});
