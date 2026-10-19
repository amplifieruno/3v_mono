import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Resolves a host name to its addresses. */
export type LookupFn = (host: string) => Promise<string[]>;

export type TargetCheck = { ok: true } | { ok: false; reason: string; retryable?: boolean };

const defaultLookup: LookupFn = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

function blockedV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || (a === 169 && b === 254);
}

/**
 * Addresses a webhook may never reach (demo policy, spec ruling): link-local incl. the cloud metadata endpoint
 * (169.254.0.0/16, fe80::/10), unspecified (0.0.0.0/8, ::), and IPv4-mapped forms of those. Private ranges and
 * loopback stay allowed so the dev sink (http://backend:3001) works.
 */
export function isBlockedAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(addr) === 4) return blockedV4(addr);
  if (isIP(addr) !== 6) return false;
  if (addr === '::' || /^fe[89ab][0-9a-f]:/.test(addr)) return true;
  const mapped = /^::ffff:(.+)$/.exec(addr)?.[1];
  if (!mapped) return false;
  if (isIP(mapped) === 4) return blockedV4(mapped);
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
  if (!hex) return false;
  const high = parseInt(hex[1], 16);
  return high >> 8 === 0 || high === 0xa9fe;
}

/**
 * Checks a subscription URL right before an attempt: http(s) only, and neither the literal host nor any resolved
 * address is blocked. (A host could still re-resolve differently for the request itself; acceptable for the demo.)
 */
export async function checkWebhookTarget(url: string, lookup: LookupFn = defaultLookup): Promise<TargetCheck> {
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
      addresses = await lookup(host);
    } catch (error) {
      return { ok: false, reason: `dns_failed: ${error instanceof Error ? error.message : String(error)}`, retryable: true };
    }
  }
  const blocked = addresses.find(isBlockedAddress);
  return blocked ? { ok: false, reason: `blocked_address: ${blocked}` } : { ok: true };
}
