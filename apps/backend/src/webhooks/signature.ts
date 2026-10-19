import { createHmac, timingSafeEqual } from 'node:crypto';

/** `x-itap-signature` value: `sha256=<hex HMAC-SHA256 of the raw body with the subscription secret>`. */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** What a receiver does: recompute over the exact received bytes and compare in constant time. */
export function verifyWebhookSignature(secret: string, body: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = Buffer.from(signWebhookBody(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
