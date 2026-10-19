/**
 * Nova Tower notification configuration (design §9, slice 5): templates (en/ru), recipient groups, the on-call
 * rotation, the "Critical incidents" escalation policy and the notification rules. Pure data; written by
 * notifications.ts. Template variables: see itap.notification_vars (events) and itap.escalate_one (escalations).
 */
export type TemplateSpec = { name: string; channel: 'in_app' | 'email' | 'sms'; locale: 'en' | 'ru'; subject?: string; body: string; isSystem: boolean };

type Family = { name: string; isSystem: boolean; en: Copy; ru: Copy; sms?: { en: string; ru: string } };
type Copy = { title: string; inApp: string; subject: string; email: string };

const FAMILIES: Family[] = [
  {
    name: 'blacklist_alert',
    isSystem: false,
    en: {
      title: '[{{severity}}] {{event_title}}',
      inApp: '{{profile_name}} {{identity_code}} seen at {{facility}} / {{area}} ({{device}}), {{occurred_at}}. Incident {{incident_code}}.',
      subject: '[{{severity}}] Watch-list match at {{facility}}: {{event_title}}',
      email:
        'A person on a watch list was recognized.\n\nPerson: {{profile_name}} ({{identity_code}})\nWhere: {{facility}} / {{area}}, camera {{device}}\nWhen: {{occurred_at}}\nIncident: {{incident_code}}\nRule: {{rule_name}}\n\nOpen the incident to acknowledge it.',
    },
    ru: {
      title: '[{{severity}}] {{event_title}}',
      inApp: '{{profile_name}} {{identity_code}}: {{facility}} / {{area}} ({{device}}), {{occurred_at}}. Инцидент {{incident_code}}.',
      subject: '[{{severity}}] Совпадение со списком наблюдения: {{facility}}',
      email:
        'Распознан человек из списка наблюдения.\n\nЧеловек: {{profile_name}} ({{identity_code}})\nГде: {{facility}} / {{area}}, камера {{device}}\nКогда: {{occurred_at}}\nИнцидент: {{incident_code}}\nПравило: {{rule_name}}\n\nОткройте инцидент, чтобы подтвердить его.',
    },
  },
  {
    name: 'restricted_area',
    isSystem: false,
    en: {
      title: '{{event_title}}: {{area}}',
      inApp: '{{profile_name}} {{identity_code}} in {{area}} ({{facility}}) at {{occurred_at}}.',
      subject: '[{{severity}}] {{event_title}} - {{area}}',
      email: '{{event_title}}\n\nWho: {{profile_name}} ({{identity_code}})\nWhere: {{facility}} / {{area}}\nWhen: {{occurred_at}}\nRule: {{rule_name}}',
    },
    ru: {
      title: '{{event_title}}: {{area}}',
      inApp: '{{profile_name}} {{identity_code}} в зоне {{area}} ({{facility}}), {{occurred_at}}.',
      subject: '[{{severity}}] {{event_title}} - {{area}}',
      email: '{{event_title}}\n\nКто: {{profile_name}} ({{identity_code}})\nГде: {{facility}} / {{area}}\nКогда: {{occurred_at}}\nПравило: {{rule_name}}',
    },
  },
  {
    name: 'device_status',
    isSystem: false,
    en: {
      title: '{{device}}: {{event_title}}',
      inApp: '{{device}} ({{facility}}): {{event_title}} at {{occurred_at}}.',
      subject: 'Device status: {{device}} - {{event_title}}',
      email: 'Device: {{device}}\nFacility: {{facility}} / {{area}}\nStatus: {{event_title}}\nWhen: {{occurred_at}}',
    },
    ru: {
      title: '{{device}}: {{event_title}}',
      inApp: '{{device}} ({{facility}}): {{event_title}}, {{occurred_at}}.',
      subject: 'Состояние устройства: {{device}} - {{event_title}}',
      email: 'Устройство: {{device}}\nОбъект: {{facility}} / {{area}}\nСостояние: {{event_title}}\nКогда: {{occurred_at}}',
    },
  },
  {
    name: 'incident_escalation',
    isSystem: true,
    en: {
      title: '{{event_title}}',
      inApp: '{{incident_code}} ({{severity}}) is not acknowledged: escalation step {{step}} of policy {{policy}}. {{facility}} / {{area}}, since {{occurred_at}}.',
      subject: '[Escalation {{step}}] {{incident_code}} {{incident_title}}',
      email:
        'Incident {{incident_code}} ({{severity}}) has not been acknowledged.\n\n{{incident_title}}\nWhere: {{facility}} / {{area}}\nOpened: {{occurred_at}}\nEscalation step {{step}} (cycle {{cycle}}) of policy {{policy}}.',
    },
    ru: {
      title: '{{event_title}}',
      inApp: '{{incident_code}} ({{severity}}) не подтверждён: шаг эскалации {{step}}, политика {{policy}}. {{facility}} / {{area}}, с {{occurred_at}}.',
      subject: '[Эскалация {{step}}] {{incident_code}} {{incident_title}}',
      email:
        'Инцидент {{incident_code}} ({{severity}}) не подтверждён.\n\n{{incident_title}}\nГде: {{facility}} / {{area}}\nОткрыт: {{occurred_at}}\nШаг эскалации {{step}} (цикл {{cycle}}), политика {{policy}}.',
    },
    sms: {
      en: 'ITAP: {{incident_code}} ({{severity}}) unacknowledged, escalation {{step}}. {{facility}}.',
      ru: 'ITAP: {{incident_code}} ({{severity}}) не подтверждён, эскалация {{step}}. {{facility}}.',
    },
  },
  {
    name: 'generic',
    isSystem: true,
    en: {
      title: '{{event_title}}',
      inApp: '{{event_title}} - {{facility}} / {{area}}, {{occurred_at}}.',
      subject: '[{{severity}}] {{event_title}}',
      email: '{{event_title}}\n\nWhere: {{facility}} / {{area}}\nWhen: {{occurred_at}}\nRule: {{rule_name}}',
    },
    ru: {
      title: '{{event_title}}',
      inApp: '{{event_title}} - {{facility}} / {{area}}, {{occurred_at}}.',
      subject: '[{{severity}}] {{event_title}}',
      email: '{{event_title}}\n\nГде: {{facility}} / {{area}}\nКогда: {{occurred_at}}\nПравило: {{rule_name}}',
    },
  },
];

/** in_app: subject = the inbox title, body = the inbox text; email: subject + body; sms (escalation): body only. */
export const NOTIFICATION_TEMPLATES: TemplateSpec[] = FAMILIES.flatMap((f) => {
  const locales = ['en', 'ru'] as const;
  const rows: TemplateSpec[] = locales.flatMap((locale) => [
    { name: f.name, channel: 'in_app' as const, locale, subject: f[locale].title, body: f[locale].inApp, isSystem: f.isSystem },
    { name: f.name, channel: 'email' as const, locale, subject: f[locale].subject, body: f[locale].email, isSystem: f.isSystem },
  ]);
  const sms = f.sms;
  return sms ? [...rows, ...locales.map((locale) => ({ name: f.name, channel: 'sms' as const, locale, body: sms[locale], isSystem: f.isSystem }))] : rows;
});

export type SeedUsers = { admin: string; novaAdmin: string; operator: string };
export type GroupMember = { user_id: string; channel: string } | { external_address: string; channel: string };
export type GroupSpec = { name: string; description: string; members: GroupMember[] };

export const SECURITY_TEAM = 'Security team';
export const FACILITY_MANAGERS = 'Facility managers';
export const ON_CALL = 'On-call';

/**
 * Users reach a rule over every channel they have a member row for. The facility desk's old mailbox is in the
 * reserved .invalid domain: its deliveries fail and end as dead letters (demonstrates retries in the reports).
 */
export function groupSpecs(users: SeedUsers): GroupSpec[] {
  return [
    {
      name: SECURITY_TEAM,
      description: 'Security administrators and the security operations mailbox',
      members: [
        { user_id: users.admin, channel: 'in_app' },
        { user_id: users.admin, channel: 'email' },
        { user_id: users.novaAdmin, channel: 'in_app' },
        { user_id: users.novaAdmin, channel: 'email' },
        { external_address: 'soc@novatower.example', channel: 'email' },
      ],
    },
    {
      name: FACILITY_MANAGERS,
      description: 'Building management: device status digests and VIP arrivals',
      members: [
        { user_id: users.novaAdmin, channel: 'in_app' },
        { user_id: users.novaAdmin, channel: 'email' },
        { external_address: 'facilities@novatower.example', channel: 'email' },
        { external_address: 'old-desk@novatower.invalid', channel: 'email' },
      ],
    },
    {
      name: ON_CALL,
      description: 'Everyone in the security on-call rotation',
      members: [
        { user_id: users.operator, channel: 'in_app' },
        { user_id: users.operator, channel: 'sms' },
        { user_id: users.novaAdmin, channel: 'sms' },
        { user_id: users.admin, channel: 'sms' },
      ],
    },
  ];
}

export const ON_CALL_SCHEDULE = { name: 'Security on-call', shiftLengthHours: 12, description: '12-hour shifts starting 08:00 and 20:00 local time' };
/** Rotation order: the operator, then the Nova admin, then the main admin. */
export const onCallOrder = (users: SeedUsers): string[] => [users.operator, users.novaAdmin, users.admin];

export const ESCALATION_POLICY = {
  name: 'Critical incidents',
  description: 'Security team at once, then the on-call phone after 10 minutes; repeats up to three times until acknowledged',
  repeat: true,
  max_cycles: 3,
};
/**
 * A step has one channel, so "security team in_app + email at 0 min" is two 0-minute steps (taken on consecutive
 * cron runs), then the on-call member by SMS 10 minutes later.
 */
export const ESCALATION_STEPS: ({ step_no: number; after_minutes: number; channel: string } & ({ group: string } | { onCall: true }))[] = [
  { step_no: 10, after_minutes: 0, channel: 'in_app', group: SECURITY_TEAM },
  { step_no: 20, after_minutes: 0, channel: 'email', group: SECURITY_TEAM },
  { step_no: 30, after_minutes: 10, channel: 'sms', onCall: true },
];

/** Minutes after the previous escalation (or the incident) for each step of ESCALATION_STEPS. */
const STEP_DELAYS_MIN = [1, 1, 10];

/**
 * History escalation instants of an incident under the policy, one pass (cycle 0): the escalate cron runs on whole
 * minutes, so step 1 is the first whole minute after the incident, each later step its after_minutes (at least one
 * cron run) after the previous. Steps at or after the acknowledgement are dropped (the cron skips acknowledged).
 */
export function escalationTimes(createdAt: number, acknowledgedAt: number | null): number[] {
  const MIN = 60_000;
  let at = Math.floor(createdAt / MIN) * MIN;
  const times = STEP_DELAYS_MIN.map((delay) => (at += delay * MIN));
  return acknowledgedAt === null ? times : times.filter((t) => t < acknowledgedAt);
}

const MINUTE_MS = 60_000;

/**
 * Escalation instants of one history incident (all at or before `latest`, the replay end, except the demo's):
 *   acknowledged: the steps before the acknowledgement;
 *   the demo (open, live): the first pass, then cycle 1 steps 1-2 at 7 and 6 minutes before `now`, so its on-call
 *     step is due about 4 minutes later (the intermediate cycles are not simulated);
 *   open, not the demo: none. The policy is set together with the escalations, so such an incident never gets one
 *     (an unacknowledged incident under the policy would start escalating live).
 */
export function historyEscalations(args: { createdAt: number; acknowledgedAt: number | null; demo: boolean; latest: number; now: number }): number[] {
  if (args.acknowledgedAt === null && !args.demo) return [];
  const pass = escalationTimes(args.createdAt, args.acknowledgedAt).filter((t) => t <= args.latest);
  return args.demo ? [...pass, args.now - 7 * MINUTE_MS, args.now - 6 * MINUTE_MS] : pass;
}

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
];

/** Event types the seeded webhook subscription (dev sink) receives. */
export const WEBHOOK_EVENT_TYPES = ['blacklist_match', 'watchlist_match', 'restricted_area_entry'];
export const WEBHOOK_SINK_PATH = '/hasura/events/webhook-sink';
export const WEBHOOK_DESCRIPTION = 'SIEM forwarder (dev sink)';
