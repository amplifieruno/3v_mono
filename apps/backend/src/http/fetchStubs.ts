/**
 * Fetch stand-ins for unit tests of the HTTP clients (no network). Install with `vi.stubGlobal('fetch', ...)`.
 */

/** A fetch that never answers; it rejects with the signal's reason when the request is aborted. */
export function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
}

/**
 * A fetch that answers headers (`status`) at once but whose body never ends; the body stream errors with the signal's
 * reason when the request is aborted (what undici does when a timeout fires during the body read).
 */
export function hangingBodyFetch(status = 200): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      },
    });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
