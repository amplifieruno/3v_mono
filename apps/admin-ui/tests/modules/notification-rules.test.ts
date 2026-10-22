import type { Rule } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import {
  ESCALATION_POLICY_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
  INCIDENT_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  NOTIFICATION_TEMPLATE_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
} from '../../src/data/resource-names';
import { NOTIFICATION_TEMPLATE_CHECKS, localeProblem, placeholderProblem } from '../../src/modules/notifications/notification-template-fields';
import { expectTranslated } from '../support/field-issues';

/**
 * Notification rules and templates without the UI: rule channels never offer a webhook, system
 * templates and rules that have notified are protected, the rule's "Test rule" presents the dry
 * run block, a template's placeholders, language and email subject are checked like the database
 * does, and incidents and rule versions name their escalation policy.
 */

type Def = {
  readonly fields: Readonly<Record<string, { readonly kind?: string; readonly values?: readonly string[]; readonly meta?: Record<string, unknown> }>>;
  readonly rules?: Rule[];
  readonly operations?: Record<string, boolean>;
  readonly actions?: { readonly item?: readonly { readonly name?: string; readonly kind?: string }[] };
};

const def = (name: string) => app.registry.get(name) as unknown as Def;
const field = (resource: string, name: string) => def(resource).fields[name];
const denied = (resource: string, action: string, record: Record<string, unknown>) =>
  (def(resource).rules ?? [])
    .filter((r) => (r.target as { name?: string }).name === action)
    .some((r) => (r.when as (ctx: { record: unknown }) => boolean)({ record }));

beforeAll(async () => {
  await app.ready;
});

describe('notification rules', () => {
  it('should never offer a webhook as a rule channel or a template channel', () => {
    expect(field(NOTIFICATION_RULE_CHANNEL_RESOURCE, 'channel')?.values).toEqual(['in_app', 'email', 'sms', 'push']);
    expect(field(NOTIFICATION_TEMPLATE_RESOURCE, 'channel')?.values).toEqual(['in_app', 'email', 'sms', 'push']);
  });

  it('should add and remove event types and channels, never change them', () => {
    expect(def(NOTIFICATION_RULE_EVENT_TYPE_RESOURCE).operations?.edit).toBe(false);
    expect(def(NOTIFICATION_RULE_CHANNEL_RESOURCE).operations?.edit).toBe(false);
  });

  it('should delete a rule that never notified only', () => {
    expect(denied(NOTIFICATION_RULE_RESOURCE, 'delete', { last_triggered_at: null })).toBe(false);
    expect(denied(NOTIFICATION_RULE_RESOURCE, 'delete', { last_triggered_at: '2026-10-22T09:00:00Z' })).toBe(true);
  });

  it('should offer "Test rule" as the dry-run block, not as a write', () => {
    const test = def(NOTIFICATION_RULE_RESOURCE).actions?.item?.find((action) => action.name === 'test');
    expect(test?.kind).toBe('modal');
  });

  it('should keep recipient groups and escalation policies read only for now', () => {
    for (const name of [RECIPIENT_GROUP_RESOURCE, ESCALATION_POLICY_RESOURCE]) {
      expect(def(name).operations).toMatchObject({ create: false, edit: false, delete: false });
    }
  });

  it('should name the escalation policy of incidents and rule versions', () => {
    for (const resource of [INCIDENT_RESOURCE, EVENT_RULE_VERSION_RESOURCE, NOTIFICATION_RULE_RESOURCE]) {
      const policy = field(resource, 'escalation_policy_id');
      expect(policy?.kind, resource).toBe('relation');
      expect(JSON.stringify(policy?.meta), resource).toContain(ESCALATION_POLICY_RESOURCE);
    }
  });
});

describe('notification templates', () => {
  it('should protect system templates from edits and deletes', () => {
    for (const action of ['edit', 'delete']) {
      expect(denied(NOTIFICATION_TEMPLATE_RESOURCE, action, { is_system: true }), action).toBe(true);
      expect(denied(NOTIFICATION_TEMPLATE_RESOURCE, action, { is_system: false }), action).toBe(false);
    }
  });

  it('should accept the placeholders the database accepts and refuse a malformed one', async () => {
    for (const ok of ['{{event_title}} at {{ facility }}', 'no placeholder', '{{incident.code}}', null]) {
      expect(placeholderProblem(ok), String(ok)).toBeNull();
    }
    for (const bad of ['{{Event}}', '{{ event title }}', 'open {{ only', '{{9lives}}']) {
      expect(placeholderProblem(bad)?.code, bad).toBe('templatePlaceholders.malformed');
    }
    const problem = placeholderProblem('{{X}}');
    if (problem !== null) await expectTranslated(problem);
  });

  it('should accept language codes as the database does', async () => {
    for (const ok of ['en', 'ru', 'pt-BR', 'fil']) expect(localeProblem(ok), ok).toBeNull();
    for (const bad of ['EN', 'english', 'e', 'pt_BR']) expect(localeProblem(bad)?.code, bad).toBe('templateLocale.format');
    const problem = localeProblem('EN');
    if (problem !== null) await expectTranslated(problem);
  });

  it('should ask an email template for a subject', () => {
    const missing = NOTIFICATION_TEMPLATE_CHECKS[0]?.when as (ctx: { values: Record<string, unknown> }) => boolean;
    expect(missing({ values: { channel: 'email', subject: '  ' } })).toBe(true);
    expect(missing({ values: { channel: 'email', subject: 'Alert' } })).toBe(false);
    expect(missing({ values: { channel: 'sms', subject: null } })).toBe(false);
  });
});
