import { f } from '@burojs/field-types';
import { EVENT_RESOURCE, WEBHOOK_SUBSCRIPTION_RESOURCE } from '../../data/resource-names';
import { EVENT_TYPE_ENUM } from '../../enums/events';
import { EVENT_TYPES } from '../../enums/event-types';
import { enumField } from '../../enums/field';
import { WEBHOOK_DELIVERY_STATUSES, WEBHOOK_DELIVERY_STATUS_ENUM } from '../../enums/notifications';
import { dateTime } from '../../fields/date-time';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.webhook_deliveries`: one signed POST of one event to one webhook subscription,
 * written at the event's fan-out and moved on by the sender (`send_webhook`, `retry_webhooks`).
 */
export const webhookDeliveryFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Created', doc: { summary: 'When the event was handed to the webhook.' } },
  }),
  subscription_id: f.relation({
    to: WEBHOOK_SUBSCRIPTION_RESOURCE,
    system: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'subscription' },
    texts: { label: 'Webhook', doc: { summary: 'The webhook subscription it was sent to.' } },
  }),
  event_type: enumField(EVENT_TYPES, EVENT_TYPE_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Event type', doc: { summary: 'The type of the event sent (also the x-itap-event header).' } },
  }),
  event_id: f.relation({
    to: EVENT_RESOURCE,
    system: true,
    in: [...shown],
    open: 'page',
    texts: { label: 'Event', doc: { summary: 'The event sent.' } },
  }),
  status: enumField(WEBHOOK_DELIVERY_STATUSES, WEBHOOK_DELIVERY_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Pending until the first attempt, then sent (a 2xx answer). An error status or a timeout is retried with a growing pause up to five attempts, then given up as a dead letter; a blocked address or a switched-off subscription fails at once, without retries.',
      },
    },
  }),
  attempts: f.number({
    system: true,
    in: [...shown],
    texts: { label: 'Attempts', doc: { summary: 'How many times the POST was tried.' } },
  }),
  response_code: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Response', doc: { summary: 'The HTTP status the receiving system answered last; empty when nothing answered.' } },
  }),
  error: f.text({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Error',
      doc: {
        summary:
          'Why the last attempt failed: HTTP <status>, a timeout or network error, or blocked_address: <ip> when the sender refused a loopback, private or link-local address (outside development private addresses are refused).',
      },
    },
  }),
  sent_at: dateTime({ system: true, in: [...showOnly], texts: { label: 'Sent', doc: { summary: 'When the receiving system accepted it.' } } }),
  next_attempt_at: dateTime({
    system: true,
    in: [...showOnly],
    texts: { label: 'Next attempt', doc: { summary: 'When the next attempt is due, while it is retrying.' } },
  }),
  signature: f.string({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: {
      label: 'Signature',
      doc: { summary: 'The x-itap-signature header sent: sha256=<HMAC-SHA256 of the body with the subscription’s secret>.' },
    },
  }),
  body: f.json({
    system: true,
    in: [...showOnly],
    texts: { label: 'Body', doc: { summary: 'The JSON POSTed, built once when the event happened, so every attempt sends (and signs) the same bytes.' } },
  }),
};
