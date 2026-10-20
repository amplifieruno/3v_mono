/**
 * Live health probes for get_system_status (slice 10 task 4): one HTTP request per platform service with a timeout,
 * classified ok (2xx within 1 s) / degraded (2xx but slow) / down (error, timeout, non-2xx).
 */

export type Level = 'ok' | 'degraded' | 'down';
export type Check = { name: string; status: Level; latency_ms: number; details?: Record<string, unknown> };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const SLOW_MS = 1000;
export const PROBE_TIMEOUT_MS = 3000;
const RANK: Record<Level, number> = { ok: 0, degraded: 1, down: 2 };

export function classify(succeeded: boolean, latencyMs: number): Level {
  if (!succeeded) return 'down';
  return latencyMs > SLOW_MS ? 'degraded' : 'ok';
}

export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), 'ok');
}

export function isLevel(value: unknown): value is Level {
  return value === 'ok' || value === 'degraded' || value === 'down';
}

/** GET `url`; `details` extracts facts from a successful body (its errors are ignored). */
export async function probe(
  name: string,
  url: string,
  options: { fetch?: FetchLike; timeoutMs?: number; details?: (body: string) => Record<string, unknown> } = {},
): Promise<Check> {
  const fetchFn: FetchLike = options.fetch ?? ((u, init) => fetch(u, init));
  const started = performance.now();
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(options.timeoutMs ?? PROBE_TIMEOUT_MS) });
    const body = await res.text();
    const latency = Math.round(performance.now() - started);
    if (!res.ok) return { name, status: 'down', latency_ms: latency, details: { error: `HTTP ${res.status}` } };
    let details: Record<string, unknown> | undefined;
    try {
      details = options.details?.(body);
    } catch {
      details = undefined;
    }
    return { name, status: classify(true, latency), latency_ms: latency, ...(details ? { details } : {}) };
  } catch (error: unknown) {
    const latency = Math.round(performance.now() - started);
    return { name, status: 'down', latency_ms: latency, details: { error: error instanceof Error ? error.message : String(error) } };
  }
}
