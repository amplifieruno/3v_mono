/** A claimed notification delivery as the stub providers see it. */
export type ChannelDelivery = {
  id: string;
  channel: string;
  recipient_address: string | null;
  recipient_user_id: string | null;
  content: { subject?: string | null; body?: string | null; title?: string | null };
};

export type DeliveryLog = (entry: Record<string, unknown>) => void;

/** Structured log line (one JSON object) on stdout. */
export const consoleDeliveryLog: DeliveryLog = (entry) => {
  console.info(JSON.stringify(entry));
};

/**
 * Stubbed outside world (spec §8.5, demo rule 6): email is logged and stays `sent` (no delivery receipt; no SMTP
 * server in the stack); sms, push and the webhook channel of recipient groups are `delivered` at once. A recipient
 * address in the reserved `.invalid` domain (RFC 2606) fails, which demonstrates retries and dead letters.
 * Returns whether the provider confirmed delivery; throws on failure.
 */
export function sendViaStub(d: ChannelDelivery, log: DeliveryLog): { delivered: boolean } {
  const to = d.recipient_address ?? `user:${d.recipient_user_id ?? ''}`;
  if (d.recipient_address && /\.invalid$/i.test(d.recipient_address.trim())) {
    throw new Error(`recipient ${d.recipient_address} is unreachable (.invalid domain)`);
  }
  log({
    msg: 'notification_sent',
    channel: d.channel,
    delivery_id: d.id,
    to,
    subject: d.content.subject ?? d.content.title ?? null,
  });
  return { delivered: d.channel !== 'email' };
}
