import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { unreadBadge } from '../../src/app/unread-badge';
import {
  INCIDENT_ACTIVITY_RESOURCE,
  INCIDENT_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  USER_NOTIFICATION_RESOURCE,
  WEBHOOK_DELIVERY_RESOURCE,
  WEBHOOK_SUBSCRIPTION_RESOURCE,
} from '../../src/data/resource-names';
import { secret } from '../../src/fields/secret';
import {
  ACKNOWLEDGE_NOTIFICATION_EFFECTS,
  acknowledgeNotificationOperation,
  markAllNotificationsReadOperation,
  markNotificationReadOperation,
  summaryOf,
} from '../../src/modules/notifications/inbox-ops';
import { secretLengthProblem } from '../../src/modules/notifications/webhook-subscription-fields';
import { webhookUrlProblem } from '../../src/modules/notifications/webhook-url';

/**
 * The inbox and webhooks without the UI: the inbox operations (mark read with one id, mark all
 * read with none, acknowledge refreshing the incident), the bell's figures, the webhook address
 * rules (the database's CHECK as errors, the sender's private-address guard as a warning) and the
 * required, non-removable signing secret.
 */

type Def = {
  readonly operations?: Record<string, boolean>;
  readonly fields: Readonly<Record<string, { readonly meta?: Record<string, unknown> }>>;
};
const def = (name: string) => app.registry.get(name) as unknown as Def;

beforeAll(async () => {
  await app.ready;
});

describe('inbox operations', () => {
  const vars = (entry: { readonly document: unknown }, input: unknown) =>
    (entry.document as { readonly variables: (input: unknown) => unknown }).variables(input);
  const doc = (entry: { readonly document: unknown }) => (entry.document as { readonly document: string }).document;

  it('should mark one notification read by its id and all of them with no ids', () => {
    const id = '99999999-9999-4999-8999-000000000001';
    expect(vars(markNotificationReadOperation, { notificationId: id })).toEqual({ ids: `{${id}}` });
    expect(doc(markAllNotificationsReadOperation)).toContain('mark_notifications_read(args: { p_ids: null })');
    expect(vars(markAllNotificationsReadOperation, {})).toEqual({});
  });

  it('should read the incident and its timeline again after acknowledging (an escalation page acknowledges it)', () => {
    expect(vars(acknowledgeNotificationOperation, { notificationId: 'n' })).toEqual({ notification: 'n' });
    expect(ACKNOWLEDGE_NOTIFICATION_EFFECTS.map((effect) => effect.resource).sort()).toEqual(
      [USER_NOTIFICATION_RESOURCE, NOTIFICATION_DELIVERY_RESOURCE, INCIDENT_RESOURCE, INCIDENT_ACTIVITY_RESOURCE].sort(),
    );
  });

  it('should read the bell’s figures, an odd answer as an empty inbox', () => {
    const latest = [{ id: 'a', title: 'T', priority: 'high', created_at: '2026-10-22T08:00:00Z', read_at: null }];
    expect(summaryOf({ unread: { aggregate: { count: 4 } }, latest })).toEqual({ unread: 4, latest });
    expect(summaryOf(null)).toEqual({ unread: 0, latest: [] });
    expect(unreadBadge(7)).toBe('7');
    expect(unreadBadge(140)).toBe('99+');
  });

  it('should keep the inbox and the webhook delivery log read only', () => {
    for (const name of [USER_NOTIFICATION_RESOURCE, WEBHOOK_DELIVERY_RESOURCE]) {
      expect(def(name).operations).toMatchObject({ create: false, edit: false, delete: false });
    }
  });
});

describe('webhook address', () => {
  const severity = (url: string) => webhookUrlProblem(url)?.severity ?? null;

  it('should accept a public https address', () => {
    expect(webhookUrlProblem('https://siem.example.com/hooks/itap?x=1')).toBeNull();
    expect(webhookUrlProblem('http://203.0.113.10:8443/in')).toBeNull();
  });

  it('should refuse what the database refuses: no http(s), spaces, credentials, link-local and metadata addresses', () => {
    expect(webhookUrlProblem('ftp://example.com')?.code).toBe('webhookUrl.format');
    expect(webhookUrlProblem('https://exa mple.com')?.code).toBe('webhookUrl.format');
    expect(webhookUrlProblem(`https://example.com/${'a'.repeat(2048)}`)?.code).toBe('webhookUrl.format');
    expect(webhookUrlProblem('https://user:pw@example.com/')?.code).toBe('webhookUrl.credentials');
    for (const url of ['http://169.254.169.254/latest/meta-data', 'http://0.0.0.0/', 'http://[fe80::1]/', 'http://[::ffff:169.254.1.1]/']) {
      expect(webhookUrlProblem(url)?.code, url).toBe('webhookUrl.blocked');
    }
    expect(severity('http://169.254.169.254/')).toBe('error');
  });

  it('should warn that ranges the sender never calls are saved but fail, as the sender (target.ts) classifies them', () => {
    for (const url of ['http://0.1.2.3/', 'http://[::]/', 'http://[::ffff:a9fe:101]/', 'http://[::ffff:0.0.0.5]/', 'http://2852039166/', 'http://0/']) {
      expect(webhookUrlProblem(url)?.code, url).toBe('webhookUrl.neverSent');
      expect(severity(url), url).toBe('warning');
    }
    // The database still refuses its own literal forms.
    expect(severity('http://0.0.0.0/')).toBe('error');
    expect(webhookUrlProblem('http://8.8.8.8/')).toBeNull();
    expect(webhookUrlProblem('http://134744072/')).toBeNull();
  });

  it('should warn, not refuse, about loopback and private addresses the sender blocks outside development', () => {
    for (const url of ['http://localhost:3001/x', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.20.0.4/', 'http://192.168.1.1/', 'http://[::1]/', 'http://[fd00::1]/']) {
      expect(webhookUrlProblem(url)?.code, url).toBe('webhookUrl.private');
      expect(severity(url), url).toBe('warning');
    }
    // Written as a number or as an IPv4-mapped IPv6 address, the sender reads the same private host.
    for (const url of ['http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:10.0.0.1]/']) {
      expect(webhookUrlProblem(url)?.code, url).toBe('webhookUrl.private');
    }
    // 172.32.x is public; a host name is only resolved by the sender.
    expect(webhookUrlProblem('http://172.32.0.1/')).toBeNull();
    expect(webhookUrlProblem('http://backend:3001/hasura/events/webhook-sink')).toBeNull();
  });
});

describe('webhook signing secret', () => {
  const field = secret({ required: true, check: secretLengthProblem });
  const validate = (field as unknown as { readonly opts: { readonly validate: (v: unknown, ctx: unknown) => unknown } }).opts.validate;

  it('should need a secret of 16 to 256 characters on a new webhook only', () => {
    expect(validate(undefined, { values: {} })).toMatchObject({ code: 'secret.required' });
    expect(validate(undefined, { values: { id: 'w1' } })).toBeNull();
    expect(validate('short', { values: { id: 'w1' } })).toMatchObject({ code: 'webhookSecret.length' });
    expect(validate('x'.repeat(16), { values: {} })).toBeNull();
    expect(validate('x'.repeat(257), { values: {} })).toMatchObject({ code: 'webhookSecret.length' });
  });

  it('should be write-only and offer no removal (the column is NOT NULL)', () => {
    expect(def(WEBHOOK_SUBSCRIPTION_RESOURCE).fields.secret?.meta).toEqual({ writeOnly: true, removable: false });
    expect(secret().meta).toEqual({ writeOnly: true });
  });
});
