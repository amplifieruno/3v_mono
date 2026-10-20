import { createHasuraClient } from '../hasura/client.js';
import { signWebhookBody } from '../webhooks/signature.js';
import { NOTIFICATION_RULES } from './notificationRules.js';
import type { SeedContext } from './tenancy.js';

/**
 * Notification side of the Nova Tower history (slice 5): escalations of history incidents at simulated instants,
 * the escalation policy on the blacklist event and notification rules for live incidents, and the signatures of the
 * replayed webhook deliveries.
 */

/**
 * GraphQL fields that escalate one incident at each instant (itap.seed_escalate_incident: the cron path, one step per
 * call, setting the policy) and then date the deliveries they wrote (itap.seed_finalize_notifications). Meant to run
 * in the same request (transaction) as the acknowledgement, so the live escalate cron never sees the incident with a
 * policy while it is still unacknowledged.
 */
export function escalationFields(args: { org: string; incident: string; policy: string; times: number[]; until: number }): string[] {
  if (args.times.length === 0) return [];
  const iso = (ms: number) => new Date(ms).toISOString();
  return [
    ...args.times.map(
      (t, i) => `esc${i}: seed_escalate_incident(args: { p_incident: "${args.incident}", p_policy: "${args.policy}", p_at: "${iso(t)}" }) { id }`,
    ),
    `escFinal: seed_finalize_notifications(args: { p_organization: "${args.org}", p_until: "${iso(args.until)}" }) { id }`,
  ];
}

const RULE = `
  query SeedWatchRulePolicy($org: uuid!, $name: String!) {
    event_rules(where: { organization_id: { _eq: $org }, name: { _eq: $name } }) {
      id current_version { id escalation_policy_id }
    }
  }
`;

/**
 * Puts the escalation policy on the rule's published version (a new version: published versions are frozen), so live
 * incidents of the rule escalate. Done after the history: replayed incidents get their policy only together with
 * their simulated escalations. Idempotent: nothing when the current version already has a policy. Returns the rule id.
 */
export async function attachEscalationPolicy(
  ctx: SeedContext,
  args: { org: string; adminUser: string; ruleName: string; policyId: string },
): Promise<string | null> {
  type Rule = { id: string; current_version: { id: string; escalation_policy_id: string | null } | null };
  const { event_rules: rules } = await ctx.admin.request<{ event_rules: Rule[] }>(RULE, { org: args.org, name: args.ruleName });
  const rule = rules[0];
  if (!rule) return null;
  if (rule.current_version?.escalation_policy_id) return rule.id;
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.adminUser, organizationId: args.org });
  const { create_event_rule_draft: drafts } = await actor.request<{ create_event_rule_draft: { id: string }[] }>(
    `mutation SeedRuleDraft($rule: uuid!) { create_event_rule_draft(args: { p_rule: $rule }) { id } }`,
    { rule: rule.id },
  );
  const draft = drafts[0];
  if (!draft) throw new Error(`seed: no draft for rule ${args.ruleName}`);
  await actor.request(
    `mutation SeedRulePolicy($v: uuid!, $policy: uuid!) {
      update_event_rule_versions_by_pk(pk_columns: { id: $v }, _set: { escalation_policy_id: $policy }) { id }
      publish_event_rule_version(args: { p_version: $v }) { id }
    }`,
    { v: draft.id, policy: args.policyId },
  );
  return rule.id;
}

/**
 * Puts the escalation policy on the notification rules marked `escalate` (NOTIFICATION_RULES), after the history for
 * the same reason as attachEscalationPolicy: with the policy in place during the replay Stage C would put it on every
 * replayed incident of the rule. Idempotent: only rules without a policy. Returns the number of rules updated.
 */
export async function attachRulePolicies(ctx: SeedContext, args: { org: string; adminUser: string; policyId: string }): Promise<number> {
  const names = NOTIFICATION_RULES.filter((r) => r.escalate).map((r) => r.name);
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.adminUser, organizationId: args.org });
  const data = await actor.request<{ update_notification_rules: { affected_rows: number } }>(
    `mutation SeedRulePolicies($org: uuid!, $names: [String!]!, $policy: uuid!) {
      update_notification_rules(
        where: { organization_id: { _eq: $org }, name: { _in: $names }, escalation_policy_id: { _is_null: true } }
        _set: { escalation_policy_id: $policy }
      ) { affected_rows }
    }`,
    { org: args.org, names, policy: args.policyId },
  );
  return data.update_notification_rules.affected_rows;
}

/** A rule id by name (incidents of the rule carry it in their dedup key). */
export async function ruleId(ctx: SeedContext, org: string, name: string): Promise<string | null> {
  const { event_rules: rules } = await ctx.admin.request<{ event_rules: { id: string }[] }>(RULE, { org, name });
  return rules[0]?.id ?? null;
}

const UNSIGNED = `
  query SeedUnsignedWebhooks($org: uuid!) {
    webhook_deliveries(where: { organization_id: { _eq: $org }, status: { _eq: sent }, signature: { _is_null: true } }) {
      id body subscription { secret }
    }
  }
`;

/**
 * Replayed webhook deliveries are marked sent in SQL (seed_finalize_notifications); their signature is computed here
 * exactly as the sender does (HMAC-SHA256 of the JSON body with the subscription secret). Returns the rows signed.
 */
export async function signHistoryWebhooks(ctx: SeedContext, org: string): Promise<number> {
  type Row = { id: string; body: unknown; subscription: { secret: string } | null };
  const { webhook_deliveries: rows } = await ctx.admin.request<{ webhook_deliveries: Row[] }>(UNSIGNED, { org });
  const signed = rows.flatMap((r) =>
    r.subscription ? [{ id: r.id, signature: signWebhookBody(r.subscription.secret, JSON.stringify(r.body)) }] : [],
  );
  for (let i = 0; i < signed.length; i += 100) {
    const batch = signed.slice(i, i + 100);
    const fields = batch.map(
      (s, j) => `s${j}: update_webhook_deliveries_by_pk(pk_columns: { id: "${s.id}" }, _set: { signature: "${s.signature}" }) { id }`,
    );
    await ctx.admin.request(`mutation SeedSignWebhooks { ${fields.join('\n')} }`);
  }
  return signed.length;
}
