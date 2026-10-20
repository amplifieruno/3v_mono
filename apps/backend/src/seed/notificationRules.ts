import { FACILITY_MANAGERS, SECURITY_TEAM } from './notificationPlan.js';

/**
 * Nova Tower notification rules and the dev webhook subscription (design §9, slices 5 and 8). Pure data; written by
 * notifications.ts (split from notificationPlan.ts).
 */
export type RuleSpec = {
  name: string;
  description: string;
  eventTypes: string[];
  channels: string[];
  group: string;
  template: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  digest: 'none' | 'hourly' | 'daily';
  /**
   * The rule carries the escalation policy (Stage C puts it on the event's incident). Attached only after the
   * history (historyNotifications.attachRulePolicies), like the event rule's: replayed incidents get their policy
   * together with their simulated escalations.
   */
  escalate: boolean;
};

/**
 * The final review split the former "Blacklist and watch-list matches" rule (escalating both kinds) into the two
 * rules below; a database seeded before keeps the old rule (rules are keyed by name) and needs `pnpm seed --reset`.
 */
export const NOTIFICATION_RULES: RuleSpec[] = [
  {
    name: 'Blacklist matches',
    description: 'Security team, in-app and email, at once (critical: never deferred by quiet hours); escalates',
    eventTypes: ['blacklist_match'],
    channels: ['in_app', 'email'],
    group: SECURITY_TEAM,
    template: 'blacklist_alert',
    priority: 'critical',
    digest: 'none',
    escalate: true,
  },
  {
    name: 'Watch-list matches',
    description: 'Security team, in-app and email, at once (critical: never deferred by quiet hours); no escalation',
    eventTypes: ['watchlist_match'],
    channels: ['in_app', 'email'],
    group: SECURITY_TEAM,
    template: 'blacklist_alert',
    priority: 'critical',
    digest: 'none',
    escalate: false,
  },
  {
    name: 'Restricted areas and after-hours presence',
    description: 'Security team inbox',
    eventTypes: ['restricted_area_entry', 'after_hours'],
    channels: ['in_app'],
    group: SECURITY_TEAM,
    template: 'restricted_area',
    priority: 'high',
    digest: 'none',
    escalate: false,
  },
  {
    name: 'Device status digest',
    description: 'Facility managers get device offline / online changes as an hourly email digest',
    eventTypes: ['device_offline', 'device_online'],
    channels: ['email'],
    group: FACILITY_MANAGERS,
    template: 'device_status',
    priority: 'medium',
    digest: 'hourly',
    escalate: false,
  },
  {
    name: 'VIP arrivals',
    description: 'Facility managers inbox',
    eventTypes: ['vip_arrival'],
    channels: ['in_app'],
    group: FACILITY_MANAGERS,
    template: 'generic',
    priority: 'low',
    digest: 'none',
    escalate: false,
  },
  {
    // Slice 8: supervisor notification of emergency overrides (start and end, incl. the automatic end).
    name: 'Emergency overrides',
    description: 'Security team, in-app and email, when an emergency override starts or ends',
    eventTypes: ['emergency_override_started', 'emergency_override_ended'],
    channels: ['in_app', 'email'],
    group: SECURITY_TEAM, template: 'generic', priority: 'high', digest: 'none', escalate: false,
  },
  {
    // Slice 8 final review: tailgating at a door (Stage B) reaches the security team inbox.
    name: 'Tailgating',
    description: 'Security team inbox when more people pass a door than were granted',
    eventTypes: ['tailgating'],
    channels: ['in_app'],
    group: SECURITY_TEAM, template: 'generic', priority: 'high', digest: 'none', escalate: false,
  },
];

/** Event types the seeded webhook subscription (dev sink) receives. */
export const WEBHOOK_EVENT_TYPES = ['blacklist_match', 'watchlist_match', 'restricted_area_entry'];
export const WEBHOOK_SINK_PATH = '/hasura/events/webhook-sink';
export const WEBHOOK_DESCRIPTION = 'SIEM forwarder (dev sink)';
