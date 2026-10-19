import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signWebhookBody, verifyWebhookSignature } from './signature.js';

describe('webhook signature', () => {
  const body = '{"event_id":"e-1","title":"Unknown person"}';

  it('should be sha256=<hex HMAC-SHA256 of the raw body with the secret>', () => {
    const expected = createHmac('sha256', 'secret-0123456789').update(body).digest('hex');
    expect(signWebhookBody('secret-0123456789', body)).toBe(`sha256=${expected}`);
  });

  it('should verify only with the same secret and the exact body', () => {
    const signature = signWebhookBody('secret-0123456789', body);
    expect(verifyWebhookSignature('secret-0123456789', body, signature)).toBe(true);
    expect(verifyWebhookSignature('other-secret-000000', body, signature)).toBe(false);
    expect(verifyWebhookSignature('secret-0123456789', `${body} `, signature)).toBe(false);
    expect(verifyWebhookSignature('secret-0123456789', body, 'sha256=00')).toBe(false);
    expect(verifyWebhookSignature('secret-0123456789', body, undefined)).toBe(false);
  });
});
