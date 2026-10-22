import type { ValidationIssue } from '@burojs/core';
import { type FieldProblem, problemIssue } from '../../fields/field-issue';

/** A problem of a webhook address, with how hard it stops the save. */
export interface WebhookUrlProblem extends FieldProblem {
  /** `error` is refused by the database (`webhook_subscriptions_url_valid`); `warning` saves but will not be sent in production. */
  readonly severity: 'error' | 'warning';
}

const URL_SHAPE = /^https?:\/\/[^\s/?#]+([/?#]\S*)?$/i;

/** The host of an `http(s)://` address as the database reads it: lower case, IPv6 without brackets, no port. */
function hostOf(url: string): string {
  const authority = /^[A-Za-z]+:\/\/([^/?#]+)/.exec(url)?.[1] ?? '';
  const host = authority.startsWith('[') ? (/^\[([^\]]*)\]/.exec(authority)?.[1] ?? '') : (authority.split(':')[0] ?? '');
  return host.toLowerCase();
}

/** Link-local (incl. the cloud metadata address) and unspecified: refused by `itap.valid_webhook_url`. */
function isLinkLocal(host: string): boolean {
  return /^169\.254\./.test(host) || /^0+\.0+\.0+\.0+$/.test(host) || /^fe[89ab][0-9a-f]:/.test(host) || /^::ffff:169\.254\./.test(host);
}

/** Loopback and private ranges the sender refuses unless private targets are allowed (`WEBHOOK_ALLOW_PRIVATE_TARGETS`). */
function isPrivate(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(host)) return true;
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (v4 === null) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * What is wrong with a webhook address, or `null`. The errors restate the database's CHECK
 * (`itap.valid_webhook_url`): http(s) with a host, at most 2048 characters, no user name or
 * password, and never a link-local or cloud metadata address. The warning is the sender's own
 * guard, checked before each attempt: a loopback or private address (a literal one; a host name
 * is resolved only when sending) is refused unless private targets are allowed, as in
 * development, and the delivery fails with `blocked_address`.
 */
export function webhookUrlProblem(value: unknown): WebhookUrlProblem | null {
  if (typeof value !== 'string' || value === '') return null;
  if (value.length > 2048 || !URL_SHAPE.test(value)) {
    return {
      severity: 'error',
      code: 'webhookUrl.format',
      text: 'Enter an http:// or https:// address with a host, without spaces and at most 2048 characters, such as https://siem.example.com/hooks/itap.',
    };
  }
  const authority = /^[A-Za-z]+:\/\/([^/?#]+)/.exec(value)?.[1] ?? '';
  if (authority.includes('@')) {
    return {
      severity: 'error',
      code: 'webhookUrl.credentials',
      text: 'Leave the user name and password out of the address: every call is signed with the secret instead.',
    };
  }
  const host = hostOf(value);
  if (host === '' || isLinkLocal(host)) {
    return {
      severity: 'error',
      code: 'webhookUrl.blocked',
      text: 'Link-local and cloud metadata addresses (169.254.x.x, fe80::, 0.0.0.0) are never called: enter the receiving system’s address.',
    };
  }
  if (isPrivate(host)) {
    return {
      severity: 'warning',
      code: 'webhookUrl.private',
      text: 'A loopback or private network address: the platform calls it only where private targets are allowed (development). Elsewhere each delivery fails with “blocked_address” and is not retried.',
    };
  }
  return null;
}

/** {@link webhookUrlProblem} as a field validator: the issue on the field, a warning not stopping the save. */
export function checkWebhookUrl(value: unknown): Pick<ValidationIssue, 'code' | 'message' | 'path' | 'params' | 'severity'> | null {
  const problem = webhookUrlProblem(value);
  return problem === null ? null : { ...problemIssue(problem), severity: problem.severity };
}
