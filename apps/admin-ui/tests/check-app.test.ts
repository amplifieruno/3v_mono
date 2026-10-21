import { checkApp } from '@burojs/testing';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app/app-definition';
import { buildLocaleRegistry } from '../src/i18n/registry';

describe('checkApp over the console and its bundles', () => {
  it('should report no diagnostics', async () => {
    await app.ready;
    const reported = await checkApp(app, { i18n: buildLocaleRegistry() });
    expect(reported).toEqual([]);
  });

  it('should register the dashboard first and the help page last', async () => {
    await app.ready;
    // `CustomPageRegistry` has no `keys()`; `list()` is sorted by `order`.
    const names = app.registry.customPages.list().map((page) => page.name);
    expect(names).toEqual(expect.arrayContaining(['dashboard', 'help']));
    expect(names[0]).toBe('dashboard');
    expect(names.at(-1)).toBe('help');
  });
});
