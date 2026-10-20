/** Polls `read` until `done` (500 ms steps) or throws after `timeoutMs` (seed steps waiting for backend jobs). */
export async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`seed: ${what} did not finish`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
