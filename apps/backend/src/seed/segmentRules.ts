import { createHasuraClient } from '../hasura/client.js';
import { seedRules } from './historyConfig.js';
import { SEGMENT_EVENT_RULE, SEGMENT_NOTIFICATION_RULE } from './segmentPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * The two Nova Tower rules that use segments (slice 6): the event rule "Fit-out crew after hours" (after_hours,
 * scoped to the facility AND the fit-out segment) and the notification rule "Executive access holders" (conditions
 * facility_id + segment_id). Segment scopes and conditions test membership at the event's occurred_at, and the seed
 * writes the segment history after the replay, so these rules could not have matched replayed events: they are
 * created at seed time (the event rule published now) and work live only; the history has no events or deliveries of
 * them. Idempotent: keyed by name.
 */
const HOUR_MS = 3_600_000;

const LOOKUP = `
  query SeedSegmentRuleRefs($org: uuid!, $segments: [String!]!, $group: String!, $template: String!, $rule: String!) {
    segments(where: { organization_id: { _eq: $org }, name: { _in: $segments } }) { id name }
    recipient_groups(where: { organization_id: { _eq: $org }, name: { _eq: $group } }) { id }
    notification_templates(where: { organization_id: { _eq: $org }, name: { _eq: $template } }) { id channel locale }
    notification_rules(where: { organization_id: { _eq: $org }, name: { _eq: $rule } }) { id }
  }
`;
const INSERT_RULE = `
  mutation SeedSegmentNotificationRule($object: notification_rules_insert_input!) {
    insert_notification_rules_one(object: $object) { id }
  }
`;

type Lookup = {
  segments: { id: string; name: string }[];
  recipient_groups: { id: string }[];
  notification_templates: { id: string; channel: string; locale: string }[];
  notification_rules: { id: string }[];
};

export async function seedSegmentRules(ctx: SeedContext, args: { org: string; adminUser: string; facility: string }): Promise<number> {
  const rule = SEGMENT_NOTIFICATION_RULE;
  const refs = await ctx.admin.request<Lookup>(LOOKUP, {
    org: args.org,
    segments: [SEGMENT_EVENT_RULE.segment, rule.segment],
    group: rule.group,
    template: rule.template,
    rule: rule.name,
  });
  const segment = (name: string): string => {
    const id = refs.segments.find((s) => s.name === name)?.id;
    if (!id) throw new Error(`seed: segment ${name} missing`);
    return id;
  };
  const { segment: scopeSegment, ...eventRule } = SEGMENT_EVENT_RULE;
  // Created an hour ago and published now (seedRules publishes an hour after the configuration time).
  let created = await seedRules(ctx, { org: args.org, adminUser: args.adminUser, configuredAt: Date.now() - HOUR_MS }, [
    { ...eventRule, parameters: {}, scopes: [{ facility_id: args.facility }, { segment_id: segment(scopeSegment) }], publish: true },
  ]);

  if (refs.notification_rules.length === 0) {
    const group = refs.recipient_groups[0]?.id;
    const template = refs.notification_templates.find((t) => t.channel === rule.channels[0] && t.locale === 'en')?.id;
    if (!group || !template) throw new Error('seed: notification group or template missing');
    const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.adminUser, organizationId: args.org });
    await actor.request(INSERT_RULE, {
      object: {
        organization_id: args.org,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        digest_mode: 'none',
        conditions: { facility_id: args.facility, segment_id: segment(rule.segment) },
        recipient_group_id: group,
        template_id: template,
        escalation_policy_id: null,
        notification_rule_event_types: { data: rule.eventTypes.map((event_type) => ({ event_type })) },
        notification_rule_channels: { data: rule.channels.map((channel) => ({ channel })) },
      },
    });
    created += 1;
  }
  return created;
}
