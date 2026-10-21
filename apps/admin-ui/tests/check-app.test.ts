import { checkApp } from '@burojs/testing';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app/app-definition';
import { itapFieldImplementations } from '../src/fields/implementations';
import { buildLocaleRegistry } from '../src/i18n/registry';

/**
 * Diagnostics accepted on purpose, by code and location, each with its reason.
 * Anything else reported fails the test.
 */
const ACCEPTED: readonly { code: string; location: string }[] = [
  // `invite`: a lost answer of `invite_member` cannot be checked from the flow (the check sees no
  // submitted values, `tasks/ui/buro-gaps.md` G12); the unknown screen sends the administrator to
  // the Invitations list.
  { code: 'flow.unknown-unhandled', location: 'organization_invitation toolbar.resource.0.submit' },
];

describe('checkApp over the console and its bundles', () => {
  it('should report no diagnostics beyond the accepted ones', async () => {
    await app.ready;
    const reported = await checkApp(app, {
      i18n: buildLocaleRegistry(),
      fieldImplementations: itapFieldImplementations,
    });
    const unexpected = reported.filter(
      (d) => !ACCEPTED.some((a) => a.code === d.code && a.location === d.location),
    );
    expect(unexpected).toEqual([]);
  });

  it('should register the dashboard first and the help page last', async () => {
    await app.ready;
    // `CustomPageRegistry` has no `keys()`; `list()` is sorted by `order`.
    const names = app.registry.customPages.list().map((page) => page.name);
    expect(names).toEqual(expect.arrayContaining(['dashboard', 'help']));
    expect(names[0]).toBe('dashboard');
    expect(names).toContain('organization-profile');
    expect(names.at(-1)).toBe('help');
  });
});
