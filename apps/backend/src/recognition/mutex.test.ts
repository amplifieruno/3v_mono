import { describe, expect, it } from 'vitest';
import { createKeyedMutex } from './mutex.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('createKeyedMutex', () => {
  it('should run tasks of one key one at a time, in call order', async () => {
    const lock = createKeyedMutex();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([lock.run('org', task('a')), lock.run('org', task('b'))]);
    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('should not serialize different keys and should survive a failed task', async () => {
    const lock = createKeyedMutex();
    const log: string[] = [];
    const failing = lock.run('x', async () => {
      await tick();
      throw new Error('boom');
    });
    const other = lock.run('y', async () => {
      log.push('y');
      return 1;
    });
    const after = lock.run('x', async () => 2);
    await expect(failing).rejects.toThrow('boom');
    expect(await other).toBe(1);
    expect(await after).toBe(2);
    expect(log).toEqual(['y']);
  });
});
