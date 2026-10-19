import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Resolves a host name to its addresses. */
export type LookupFn = (host: string) => Promise<string[]>;

export type TargetCheck = { ok: true } | { ok: false; reason: string; retryable?: boolean };

export interface TargetOptions {
  lookup?: LookupFn;
  /** WEBHOOK_ALLOW_PRIVATE_TARGETS: loopback and private ranges are reachable (dev sink); default false. */
  allowPrivate?: boolean;
  dnsTimeoutMs?: number;
}

export const DNS_TIMEOUT_MS = 5_000;

const defaultLookup: LookupFn = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

function classifyV4(ip: string): 'blocked' | 'private' | 'public' {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || (a === 169 && b === 254)) return 'blocked';
  if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  return 'public';
}

/** IPv4 dotted form of an IPv4-mapped IPv6 address (`::ffff:a.b.c.d` or `::ffff:hhhh:hhhh`), else null. */
function mappedV4(addr: string): string | null {
  const mapped = /^::ffff:(.+)$/.exec(addr)?.[1];
  if (!mapped) return null;
  if (isIP(mapped) === 4) return mapped;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function classify(ip: string): 'blocked' | 'private' | 'public' {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(addr) === 4) return classifyV4(addr);
  if (isIP(addr) !== 6) return 'public';
  const v4 = mappedV4(addr);
  if (v4) return classifyV4(v4);
  if (addr === '::' || /^fe[89ab][0-9a-f]:/.test(addr)) return 'blocked';
  if (addr === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(addr)) return 'private';
  return 'public';
}

/**
 * Addresses a webhook may not reach. Always: link-local incl. the cloud metadata endpoint (169.254.0.0/16,
 * fe80::/10) and unspecified (0.0.0.0/8, ::), also IPv4-mapped. Unless `allowPrivate`: loopback (127/8, ::1) and
 * private ranges (10/8, 172.16/12, 192.168/16, fc00::/7).
 */
export function isBlockedAddress(ip: string, allowPrivate = false): boolean {
  const kind = classify(ip);
  return kind === 'blocked' || (kind === 'private' && !allowPrivate);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks a subscription URL right before an attempt: http(s) only, and neither the literal host nor any resolved
 * address (DNS, 5 s timeout) is blocked. (A host could still re-resolve differently for the request itself;
 * acceptable for the demo.)
 */
export async function checkWebhookTarget(url: string, options: TargetOptions = {}): Promise<TargetCheck> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'invalid_url' };
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await withTimeout((options.lookup ?? defaultLookup)(host), options.dnsTimeoutMs ?? DNS_TIMEOUT_MS);
    } catch (error) {
      return { ok: false, reason: `dns_failed: ${error instanceof Error ? error.message : String(error)}`, retryable: true };
    }
  }
  const blocked = addresses.find((a) => isBlockedAddress(a, options.allowPrivate ?? false));
  return blocked ? { ok: false, reason: `blocked_address: ${blocked}` } : { ok: true };
}
