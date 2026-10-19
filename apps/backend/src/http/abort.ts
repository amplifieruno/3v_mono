/**
 * True for the DOMException a fetch rejects with when its AbortSignal fires (`TimeoutError` from AbortSignal.timeout,
 * `AbortError` from a plain abort) — at connect time or later, while the body is being read.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  const { name } = error as { name: unknown };
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Awaits `work` (a fetch or a body read); an abort/timeout DOMException becomes `onAbort()`, anything else rethrows. */
export async function mapAbort<T>(work: Promise<T>, onAbort: () => Error): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isAbortError(error)) throw onAbort();
    throw error;
  }
}
