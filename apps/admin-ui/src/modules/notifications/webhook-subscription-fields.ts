import { f } from '@burojs/field-types';
import { WEBHOOK_SUBSCRIPTION_RESOURCE } from '../../data/resource-names';
import { EVENT_TYPE_ENUM } from '../../enums/events';
import { EVENT_TYPES } from '../../enums/event-types';
import { enumField } from '../../enums/field';
import { WEBHOOK_DELIVERY_STATUSES, WEBHOOK_DELIVERY_STATUS_ENUM } from '../../enums/notifications';
import { dateTime } from '../../fields/date-time';
import type { FieldProblem } from '../../fields/field-issue';
import { secret } from '../../fields/secret';
import { checkWebhookUrl } from './webhook-url';

/** The signing secret's length, as `webhook_subscriptions_secret_length` states it. */
export const SECRET_LENGTH = { min: 16, max: 256 } as const;

/** A typed secret outside {@link SECRET_LENGTH}, or `null`. */
export function secretLengthProblem(value: string): FieldProblem | null {
  return value.length < SECRET_LENGTH.min || value.length > SECRET_LENGTH.max
    ? { code: 'webhookSecret.length', text: 'Enter a secret of 16 to 256 characters.', params: { ...SECRET_LENGTH } }
    : null;
}

/**
 * Columns of `itap.webhook_subscriptions`: another system told about events over HTTP. The
 * secret is write-only (the role may set it but never read it back); the last delivery columns
 * are written by the sender.
 */
export const webhookSubscriptionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  url: f.string({
    required: true,
    // buro's runner reads the issue object (with its severity); the field-types typing says string.
    validate: checkWebhookUrl as unknown as (value: string) => string | null,
    texts: {
      label: 'URL',
      description: 'https://… of the receiving system; it gets a signed POST per event.',
      doc: {
        summary:
          'Where each event is POSTed as JSON. The database refuses addresses with a user name or password and link-local or cloud metadata addresses; the sender also refuses loopback and private network addresses outside development (the delivery fails with blocked_address).',
      },
    },
  }),
  secret: secret({
    required: true,
    check: secretLengthProblem,
    texts: {
      label: 'Signing secret',
      description: 'On a saved webhook, leave empty to keep the current secret.',
      doc: {
        summary:
          'Signs every call: the x-itap-signature header is sha256=<HMAC-SHA256 of the body with this secret>, so the receiver can tell the call is genuine. 16 to 256 characters; stored but never shown or read back. Typing one replaces it.',
      },
    },
  }),
  description: f.string({
    nullable: true,
    texts: { label: 'Description', doc: { summary: 'What the receiving system is, for whoever reads the list.' } },
  }),
  is_active: f.boolean({
    default: true,
    texts: {
      label: 'Active',
      doc: { summary: 'Only an active subscription gets new deliveries; switched off, its log is kept. Deleting it also deletes its log.' },
    },
  }),
  last_delivery_status: enumField(WEBHOOK_DELIVERY_STATUSES, WEBHOOK_DELIVERY_STATUS_ENUM, {
    system: true,
    nullable: true,
    in: ['list', 'show'],
    texts: { label: 'Last delivery', doc: { summary: 'How the latest attempt ended; empty until the first.' } },
  }),
  last_delivery_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Last delivery at', doc: { summary: 'When the latest attempt ended.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

const subscriptionField = f.relation({
  to: WEBHOOK_SUBSCRIPTION_RESOURCE,
  required: true,
  write: 'create',
  open: 'page',
  providerOptions: { relationship: 'subscription' },
  texts: { label: 'Webhook', doc: { summary: 'The webhook subscription the row belongs to.' } },
});

/** Columns of `itap.webhook_subscription_event_types`: one event type a webhook is sent for. */
export const webhookSubscriptionEventTypeFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  subscription_id: subscriptionField,
  event_type: enumField(EVENT_TYPES, EVENT_TYPE_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Event type',
      doc: { summary: 'Every event of this type is POSTed to the webhook; each type once per webhook.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};
