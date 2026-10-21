import { QueryClient } from '@tanstack/react-query';

/**
 * `DataError` kinds that describe a permanent condition: repeating the request
 * gets the same refusal, so a retry only keeps a skeleton on screen longer.
 */
const PERMANENT_KINDS: ReadonlySet<string> = new Set([
  'capability',
  'validation',
  'forbidden',
  'not-found',
  'cancelled',
  'configuration',
]);

/** How many times a retryable read failure is repeated. */
export const QUERY_RETRIES = 2;

/**
 * Whether a failed read is worth repeating: not for a permanent `DataError`
 * kind, not for a 4xx other than 429; yes for everything else (network, 5xx).
 * Structural on purpose: react-query hands `retry` an `unknown`.
 */
export function isRetryableError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return true;
  const { kind, status } = error as { readonly kind?: unknown; readonly status?: unknown };
  if (typeof kind === 'string' && PERMANENT_KINDS.has(kind)) return false;
  if (typeof status === 'number' && status >= 400 && status < 500) return status === 429;
  return true;
}

/**
 * The console's query client, one per mounted runtime (a shared instance would
 * leak one session's cache into the next). Mutations never retry silently.
 */
export function createItapQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => isRetryableError(error) && failureCount < QUERY_RETRIES,
      },
      mutations: { retry: false },
    },
  });
}
