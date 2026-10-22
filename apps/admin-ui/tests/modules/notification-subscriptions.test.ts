import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_ON_CALL_STEP_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_SUBSCRIPTION_RESOURCE,
  NOTIFICATION_TEMPLATE_RESOURCE,
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
} from '../../src/data/resource-names';
import { DELIVERY_SAVED_VIEWS } from '../../src/modules/notifications/notification-delivery';
import { SUBSCRIPTION_CHECKS, hasNoFilter } from '../../src/modules/notifications/notification-subscription-fields';

/**
 * My subscriptions and the delivery log without the UI. A subscription is the member's own
 * (self-service), never uses a webhook, needs at least one filter as the database does, and is
 * switched off rather than deleted so its deliveries stay in the log. Deliveries are a read-only
 * log with the Failed, Dead letters and Mine views.
 */

type FieldDef = {
  readonly kind?: string;
  readonly ui?: { readonly enum?: string };
  readonly values?: readonly string[];
  readonly system?: boolean;
  readonly opts?: { readonly required?: boolean; readonly default?: unknown; readonly system?: boolean };
};
type Def = {
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly operations?: Record<string, boolean>;
  readonly section?: string;
  readonly texts?: { readonly labelPlural?: string };
  readonly data?: { readonly scope?: { readonly facility?: { readonly field?: string; readonly empty?: string } } };
};

const def = (name: string) => app.registry.get(name) as unknown as Def;
const field = (resource: string, name: string) => def(resource).fields[name];

beforeAll(async () => {
  await app.ready;
});

describe('my subscriptions', () => {
  it('should be listed as "My subscriptions" in the notifications section', () => {
    expect(def(NOTIFICATION_SUBSCRIPTION_RESOURCE).section).toBe('notifications');
    expect(def(NOTIFICATION_SUBSCRIPTION_RESOURCE).texts?.labelPlural).toBe('My subscriptions');
  });

  it('should be created and edited but not deleted, so its deliveries stay in the log', () => {
    const ops = def(NOTIFICATION_SUBSCRIPTION_RESOURCE).operations;
    expect(ops?.create).not.toBe(false);
    expect(ops?.edit).not.toBe(false);
    expect(ops?.delete).toBe(false);
    // Unsubscribing switches it off.
    expect(field(NOTIFICATION_SUBSCRIPTION_RESOURCE, 'is_active')?.opts?.default).toBe(true);
  });

  it('should reach the member on any channel but a webhook', () => {
    expect(field(NOTIFICATION_SUBSCRIPTION_RESOURCE, 'channel')?.values).toEqual(['in_app', 'email', 'sms', 'push']);
    expect(field(NOTIFICATION_SUBSCRIPTION_RESOURCE, 'channel')?.opts?.required).toBe(true);
  });

  it('should take every severity as the least one, info by default', () => {
    const minSeverity = field(NOTIFICATION_SUBSCRIPTION_RESOURCE, 'min_severity');
    expect(minSeverity?.values).toEqual(['info', 'low', 'medium', 'high', 'critical']);
    expect(minSeverity?.opts?.default).toBe('info');
  });

  it('should never offer the subscriber: the database sets it from the session', () => {
    expect(field(NOTIFICATION_SUBSCRIPTION_RESOURCE, 'user_id')?.opts?.system).toBe(true);
  });

  it('should refuse a subscription without any filter, as the database does', () => {
    expect(hasNoFilter({ channel: 'email', min_severity: 'info', is_active: true })).toBe(true);
    expect(hasNoFilter({ event_type: null, facility_id: '', profile_id: undefined })).toBe(true);
    for (const name of ['event_type', 'facility_id', 'profile_id', 'identity_id', 'watch_list_id']) {
      expect(hasNoFilter({ [name]: 'x' }), name).toBe(false);
    }
    const [check] = SUBSCRIPTION_CHECKS;
    expect(check?.severity).toBe('error');
    expect(check?.on).toEqual(['create', 'edit']);
    const when = check?.when as (ctx: { values: Record<string, unknown> }) => boolean;
    expect(when({ values: { channel: 'in_app' } })).toBe(true);
    expect(when({ values: { watch_list_id: 'w' } })).toBe(false);
  });

  it('should list all of the member’s own subscriptions, whatever the sidebar facility (a personal list)', () => {
    expect(def(NOTIFICATION_SUBSCRIPTION_RESOURCE).data?.scope?.facility).toBeUndefined();
  });
});

describe('channel pickers', () => {
  it('should bind every person and address channel to an enum without the webhook (G52)', () => {
    // buro's picker lists every value of the field's registered enum, not the field's subset.
    const enumValuesOf = (name: string | undefined) =>
      (app.registry.enums.get(name ?? '')?.values ?? []).map((member: { value: string }) => member.value);
    const people = [
      NOTIFICATION_SUBSCRIPTION_RESOURCE,
      NOTIFICATION_RULE_CHANNEL_RESOURCE,
      NOTIFICATION_TEMPLATE_RESOURCE,
      ESCALATION_GROUP_STEP_RESOURCE,
      ESCALATION_ON_CALL_STEP_RESOURCE,
      RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
    ];
    for (const name of people) {
      expect(enumValuesOf(field(name, 'channel')?.ui?.enum), name).toEqual(['in_app', 'email', 'sms', 'push']);
    }
    expect(enumValuesOf(field(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, 'channel')?.ui?.enum)).toEqual(['email', 'sms']);
  });
});

describe('notification deliveries', () => {
  it('should be a read-only log', () => {
    expect(def(NOTIFICATION_DELIVERY_RESOURCE).operations).toMatchObject({ create: false, edit: false, delete: false });
    for (const [name, value] of Object.entries(def(NOTIFICATION_DELIVERY_RESOURCE).fields)) {
      expect(value.opts?.system ?? value.system, name).toBe(true);
    }
  });

  it('should offer every status and every channel, the webhook included', () => {
    expect(field(NOTIFICATION_DELIVERY_RESOURCE, 'status')?.values).toEqual([
      'pending',
      'sent',
      'delivered',
      'failed',
      'retrying',
      'dead_letter',
      'digested',
    ]);
    expect(field(NOTIFICATION_DELIVERY_RESOURCE, 'channel')?.values).toContain('webhook');
    expect(field(NOTIFICATION_DELIVERY_RESOURCE, 'origin')?.values).toEqual(['rule', 'escalation', 'subscription', 'report']);
  });

  it('should keep the Failed, Dead letters and Mine views', () => {
    expect(DELIVERY_SAVED_VIEWS.map((view) => [view.texts, view.state.filters])).toEqual([
      ['Failed', [{ field: 'status', op: 'in', value: ['failed', 'retrying'] }]],
      ['Dead letters', [{ field: 'status', op: 'eq', value: 'dead_letter' }]],
      ['Mine', [{ field: 'to_me', op: 'eq', value: true }]],
    ]);
  });
});
