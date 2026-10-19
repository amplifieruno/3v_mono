import { randomBytes } from 'node:crypto';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime, localDate, zonedTime } from './historyTime.js';
import {
  ESCALATION_POLICY,
  ESCALATION_STEPS,
  NOTIFICATION_RULES,
  NOTIFICATION_TEMPLATES,
  ON_CALL_SCHEDULE,
  WEBHOOK_DESCRIPTION,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_SINK_PATH,
  groupSpecs,
  onCallOrder,
} from './notificationPlan.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Nova Tower notification configuration (design §9, slice 5), seeded before the device health history and the
 * history replay so Stage C fans the replayed events out through it: templates, recipient groups, the on-call
 * rotation, the "Critical incidents" policy (repeat, max 3 cycles), notification rules and, when the backend's dev
 * webhook sink is enabled (WEBHOOK_SINK_ENABLED), a webhook subscription to it.
 * Dated at the configuration time (before the replay). Idempotent: rows keyed by name (webhook: by description);
 * children are written only with a new parent.
 */
export type SeedNotificationsResult = { policyId: string; created: number };

const EXISTING = `
  query SeedNotificationConfig($org: uuid!) {
    notification_templates(where: { organization_id: { _eq: $org } }) { id name channel locale }
    recipient_groups(where: { organization_id: { _eq: $org } }) { id name }
    on_call_schedules(where: { organization_id: { _eq: $org } }) { id name }
    escalation_policies(where: { organization_id: { _eq: $org } }) { id name }
    notification_rules(where: { organization_id: { _eq: $org } }) { id name }
    webhook_subscriptions(where: { organization_id: { _eq: $org } }) { id description }
  }
`;
type Named = { id: string; name: string };
type Existing = {
  notification_templates: (Named & { channel: string; locale: string })[];
  recipient_groups: Named[];
  on_call_schedules: Named[];
  escalation_policies: Named[];
  notification_rules: Named[];
  webhook_subscriptions: { id: string; description: string | null }[];
};

async function insert(actor: HasuraClient, table: string, objects: Record<string, unknown>[]): Promise<number> {
  if (objects.length === 0) return 0;
  const data = await actor.request<Record<string, { affected_rows: number }>>(
    `mutation SeedNotificationRows($objects: [${table}_insert_input!]!) { insert_${table}(objects: $objects) { affected_rows } }`,
    { objects },
  );
  return data[`insert_${table}`]?.affected_rows ?? 0;
}

function need(map: Map<string, string>, name: string, what: string): string {
  const id = map.get(name);
  if (!id) throw new Error(`seed: ${what} ${name} missing`);
  return id;
}

export async function seedNotifications(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
): Promise<SeedNotificationsResult> {
  const org = tenancy.orgs.nova;
  const timezone = SEED_FACILITIES.nova.timezone;
  const configuredAt = configurationTime(ctx.now, timezone);
  const created_at = new Date(configuredAt).toISOString();
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: tenancy.users.admin, organizationId: org });
  const users = { admin: tenancy.users.admin, novaAdmin: tenancy.users.novaAdmin, operator: tenancy.users.operator };
  const read = () => ctx.admin.request<Existing>(EXISTING, { org });
  const owned = { organization_id: org, created_at };
  // Nested children: organization_id comes from the parent through the composite relationship.
  const child = { created_at };
  let created = 0;

  let have = await read();
  const templateKey = (t: { name: string; channel: string; locale: string }) => `${t.name}/${t.channel}/${t.locale}`;
  const haveTemplates = new Set(have.notification_templates.map(templateKey));
  created += await insert(
    actor,
    'notification_templates',
    NOTIFICATION_TEMPLATES.filter((t) => !haveTemplates.has(templateKey(t))).map((t) => ({
      ...owned,
      name: t.name,
      channel: t.channel,
      locale: t.locale,
      subject: t.subject ?? null,
      body: t.body,
      is_system: t.isSystem,
    })),
  );

  const haveGroups = new Set(have.recipient_groups.map((g) => g.name));
  created += await insert(
    actor,
    'recipient_groups',
    groupSpecs(users)
      .filter((g) => !haveGroups.has(g.name))
      .map((g) => ({ ...owned, name: g.name, description: g.description, recipient_group_members: { data: g.members.map((m) => ({ ...child, ...m })) } })),
  );

  if (!have.on_call_schedules.some((s) => s.name === ON_CALL_SCHEDULE.name)) {
    // Shifts change at 08:00 and 20:00 local time.
    const rotationStart = zonedTime(localDate(configuredAt, timezone), 8 * 60, timezone);
    created += await insert(actor, 'on_call_schedules', [
      {
        ...owned,
        name: ON_CALL_SCHEDULE.name,
        description: ON_CALL_SCHEDULE.description,
        timezone,
        shift_length_hours: ON_CALL_SCHEDULE.shiftLengthHours,
        rotation_start_at: new Date(rotationStart).toISOString(),
        on_call_schedule_members: { data: onCallOrder(users).map((user_id, position) => ({ ...child, user_id, position })) },
      },
    ]);
  }

  have = await read();
  const groups = new Map(have.recipient_groups.map((g) => [g.name, g.id]));
  const schedule = need(new Map(have.on_call_schedules.map((s) => [s.name, s.id])), ON_CALL_SCHEDULE.name, 'on-call schedule');
  if (!have.escalation_policies.some((p) => p.name === ESCALATION_POLICY.name)) {
    created += await insert(actor, 'escalation_policies', [
      {
        ...owned,
        ...ESCALATION_POLICY,
        escalation_policy_steps: {
          data: ESCALATION_STEPS.map((s) => ({
            ...child,
            step_no: s.step_no,
            after_minutes: s.after_minutes,
            channel: s.channel,
            ...('group' in s ? { recipient_group_id: need(groups, s.group, 'group') } : { on_call_schedule_id: schedule }),
          })),
        },
      },
    ]);
    have = await read();
  }
  const policyId = need(new Map(have.escalation_policies.map((p) => [p.name, p.id])), ESCALATION_POLICY.name, 'escalation policy');

  const templates = new Map(have.notification_templates.map((t) => [templateKey(t), t.id]));
  const haveRules = new Set(have.notification_rules.map((r) => r.name));
  const facility = facilities.facilities.nova;
  created += await insert(
    actor,
    'notification_rules',
    NOTIFICATION_RULES.filter((r) => !haveRules.has(r.name)).map((r) => ({
      ...owned,
      name: r.name,
      description: r.description,
      priority: r.priority,
      digest_mode: r.digest,
      conditions: { facility_id: facility },
      recipient_group_id: need(groups, r.group, 'group'),
      template_id: need(templates, `${r.template}/${r.channels[0]}/en`, 'template'),
      // Escalating rules get the policy after the history (historyNotifications.attachRulePolicies).
      escalation_policy_id: null,
      notification_rule_event_types: { data: r.eventTypes.map((event_type) => ({ ...child, event_type })) },
      notification_rule_channels: { data: r.channels.map((channel) => ({ ...child, channel })) },
    })),
  );

  // Only where the backend's dev sink is enabled (WEBHOOK_SINK_ENABLED, dev compose): elsewhere every delivery would
  // fail (404) and dead-letter.
  if (ctx.env.WEBHOOK_SINK_ENABLED && !have.webhook_subscriptions.some((w) => w.description === WEBHOOK_DESCRIPTION)) {
    created += await insert(actor, 'webhook_subscriptions', [
      {
        ...owned,
        url: `${ctx.env.BACKEND_URL.replace(/\/+$/, '')}${WEBHOOK_SINK_PATH}`,
        secret: randomBytes(24).toString('hex'),
        description: WEBHOOK_DESCRIPTION,
        webhook_subscription_event_types: { data: WEBHOOK_EVENT_TYPES.map((event_type) => ({ ...child, event_type })) },
      },
    ]);
  }
  return { policyId, created };
}

const SUBSCRIPTIONS = `
  query SeedSubscriptions($org: uuid!) {
    notification_subscriptions(where: { organization_id: { _eq: $org } }) { user_id facility_id identity_id }
  }
`;

/**
 * Personal subscriptions (owner = the user): the main admin follows Nova Tower events of high severity or more by
 * push; the Nova admin follows the watch-list persona's identity by email. Before the replay (Stage C uses them).
 */
export async function seedSubscriptions(
  ctx: SeedContext,
  args: { org: string; users: { admin: string; novaAdmin: string }; facility: string; watchedIdentity: string | null; configuredAt: number },
): Promise<number> {
  const { notification_subscriptions: existing } = await ctx.admin.request<{
    notification_subscriptions: { user_id: string; facility_id: string | null; identity_id: string | null }[];
  }>(SUBSCRIPTIONS, { org: args.org });
  const owned = { organization_id: args.org, created_at: new Date(args.configuredAt).toISOString() };
  const wanted = [
    { ...owned, user_id: args.users.admin, facility_id: args.facility, channel: 'push', min_severity: 'high' },
    ...(args.watchedIdentity ? [{ ...owned, user_id: args.users.novaAdmin, identity_id: args.watchedIdentity, channel: 'email' }] : []),
  ];
  const missing = wanted.filter(
    (w) =>
      !existing.some(
        (e) => e.user_id === w.user_id && e.facility_id === ('facility_id' in w ? w.facility_id : null) && e.identity_id === ('identity_id' in w ? w.identity_id : null),
      ),
  );
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.users.admin, organizationId: args.org });
  return insert(actor, 'notification_subscriptions', missing);
}
