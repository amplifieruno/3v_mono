/** In-process async mutex per key (e.g. per organization): tasks of one key run one at a time, in call order. */
export type KeyedMutex = { run<T>(key: string, task: () => Promise<T>): Promise<T> };

export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<void>>();
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      // Drop the entry once this task is the last one queued, so idle keys do not accumulate.
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
  };
}
