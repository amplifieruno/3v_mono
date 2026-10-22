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
  // `apply_template`: a lost answer of `apply_facility_template` cannot be checked from the flow
  // (the check sees neither the chosen template nor the parent, G12), and resending would create
  // every area again; the unknown screen tells the user to look at the facility's areas first.
  { code: 'flow.unknown-unhandled', location: 'facility toolbar.item.0.submit' },
  // `upload_document`: a lost answer of `upload_profile_document` cannot be checked from the flow
  // (the check sees neither the title nor the file, G12), and resending would store a second copy;
  // the unknown screen tells the user to look at the profile's Documents tab first.
  { code: 'flow.unknown-unhandled', location: 'profile toolbar.item.1.submit' },
  // `enroll_face`, `add_photos`, `create_from_photos`: a lost answer of an enrollment action cannot
  // be checked from the flow (the check sees no submitted photos, G12), and resending would add the
  // photos twice; the unknown screen tells the user to look at the identity's Photos tab first.
  { code: 'flow.unknown-unhandled', location: 'profile toolbar.item.0.submit' },
  { code: 'flow.unknown-unhandled', location: 'identity toolbar.item.0.submit' },
  { code: 'flow.unknown-unhandled', location: 'identity toolbar.resource.0.submit' },
  // `merge_into`, `split`, `add_relationship`: the check sees neither the chosen identities, the
  // chosen photos nor the other identity (G12). Nothing is resent; the unknown screen tells the user
  // to look at the identity's Merges or Relationships tab (or the new identity) first. A second
  // send would be refused anyway (already merged, photos gone, pair exists).
  { code: 'flow.unknown-unhandled', location: 'identity toolbar.item.1.submit' },
  { code: 'flow.unknown-unhandled', location: 'identity toolbar.item.2.submit' },
  { code: 'flow.unknown-unhandled', location: 'identity toolbar.item.3.submit' },
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
