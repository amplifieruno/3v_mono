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

/** The host as the sender reads it: the WHATWG parser turns numeric hosts (`2130706433`, `0x7f.1`) and IPv6 forms into one canonical text. */
function senderHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return hostOf(url);
  }
}

function isV4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** Dotted form of an IPv4-mapped IPv6 address (`::ffff:a.b.c.d` or `::ffff:hhhh:hhhh`), else null. */
function mappedV4(host: string): string | null {
  const mapped = /^::ffff:(.+)$/.exec(host)?.[1];
  if (mapped === undefined) return null;
  if (isV4(mapped)) return mapped;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
  if (hex === null) return null;
  const high = parseInt(hex[1] ?? '0', 16);
  const low = parseInt(hex[2] ?? '0', 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function classifyV4(host: string): 'blocked' | 'private' | 'public' {
  const [a = 0, b = 0] = host.split('.').map(Number);
  if (a === 0 || (a === 169 && b === 254)) return 'blocked';
  if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  return 'public';
}

/** The sender's own classification of a literal host (`apps/backend/src/webhooks/target.ts`); a host name is resolved only when sending. */
function classify(host: string): 'blocked' | 'private' | 'public' {
  if (host === 'localhost' || host.endsWith('.localhost')) return 'private';
  if (isV4(host)) return classifyV4(host);
  if (!host.includes(':')) return 'public';
  const v4 = mappedV4(host);
  if (v4 !== null) return classifyV4(v4);
  if (host === '::' || /^fe[89ab][0-9a-f]:/.test(host)) return 'blocked';
  if (host === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(host)) return 'private';
  return 'public';
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
  const kind = classify(senderHost(value));
  if (kind === 'blocked') {
    return {
      severity: 'warning',
      code: 'webhookUrl.neverSent',
      text: 'This address is in a range the platform never calls (0.0.0.0/8, link-local or the unspecified IPv6 address, also written as a number or an IPv4-mapped address). It saves, but each delivery fails with “blocked_address”.',
    };
  }
  if (kind === 'private') {
    return {
      severity: 'warning',
      code: 'webhookUrl.private',
      text: 'A loopback or private network address: the platform calls it only where private targets are allowed (development). Elsewhere each delivery fails at once with “blocked_address: <address>”, without retries.',
    };
  }
  return null;
}

/** {@link webhookUrlProblem} as a field validator: the issue on the field, a warning not stopping the save. */
export function checkWebhookUrl(value: unknown): Pick<ValidationIssue, 'code' | 'message' | 'path' | 'params' | 'severity'> | null {
  const problem = webhookUrlProblem(value);
  return problem === null ? null : { ...problemIssue(problem), severity: problem.severity };
}
