import { describeScreen } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { IDENTITY_RESOURCE } from '../../src/data/resource-names';
import { IDENTITY_PHOTO_KINDS, IDENTITY_SOURCES, IDENTITY_STATUSES } from '../../src/enums/identities';
import { FACE_SOURCE_KIND } from '../../src/fields/face-photos';
import { ITAP_TABLES } from '../../src/modules';
import { IDENTITY_CHECKS, identity } from '../../src/modules/people/identity';
import { MERGE_PROFILES_EFFECTS } from '../../src/modules/people/merge-profiles';
import { identityFields } from '../../src/modules/people/identity-fields';

/**
 * Identities: the org_admin write columns, the read-only ones, no create or delete form, the
 * mapping, the edit checks that mirror the database and the file kind of uploaded face photos
 * (the merged and synthetic locks are rules, on screen in `identities-page.test.tsx`).
 */

/** The `org_admin` update columns of `itap.identities` (Hasura metadata) the console edits. */
const EDITED = ['attributes', 'custom_fields', 'is_primary_for_profile', 'link_strength', 'profile_id', 'status'];

type Screen = ReturnType<typeof describeScreen>;
const withStatus = (screen: Screen, wanted: string): string[] =>
  Object.entries(screen.fields)
    .filter(([, status]) => status === wanted)
    .map(([name]) => name)
    .sort();

const row = { id: 'i1', code: 'IDENTITY-00001', status: 'unverified', is_synthetic: false, matching_enabled: true, profile_id: null };

beforeAll(async () => {
  await app.ready;
});

describe('identity resource', () => {
  it('should edit exactly the org_admin columns it is meant to edit', () => {
    const screen = describeScreen(identity, 'edit', { sources: { record: row } });
    expect(screen.issues).toEqual([]);
    expect(withStatus(screen, 'active')).toEqual(EDITED);
  });

  it('should never write the counters, the matching flag, the source or the photo', () => {
    for (const name of [
      'code',
      'source',
      'primary_photo_file_id',
      'matching_enabled',
      'is_synthetic',
      'age',
      'confidence',
      'first_seen_at',
      'last_seen_at',
      'detection_count',
      'linked_at',
      'linked_by',
    ] as const) {
      const field = identityFields[name] as { opts: { system?: boolean; write?: string } };
      expect(field.opts.system === true || field.opts.write === 'never', name).toBe(true);
    }
  });

  it('should offer no create form and no delete', () => {
    const resource = app.registry.get(IDENTITY_RESOURCE) as { operations?: { create?: boolean; delete?: boolean } };
    expect(resource.operations).toMatchObject({ create: false, delete: false });
  });

  it('should refresh after consent changes and profile merges, which flip or move identities', () => {
    // Withdrawing biometric consent flips matching_enabled in SQL (a consent_records write).
    const resource = app.registry.get(IDENTITY_RESOURCE) as { data?: { dependencies?: readonly string[] } };
    expect(resource.data?.dependencies).toContain('table:consent_records');
    expect(MERGE_PROFILES_EFFECTS).toContainEqual({ resource: IDENTITY_RESOURCE });
  });

  it('should map itap.identities and select every declared column', () => {
    expect(ITAP_TABLES[IDENTITY_RESOURCE]).toMatchObject({ table: 'identities', selectFields: Object.keys(identityFields) });
  });

  it('should hold the enum tables’ values', () => {
    expect(IDENTITY_STATUSES).toEqual(['unverified', 'pending_verification', 'verified', 'suspended', 'archived', 'merged']);
    expect(IDENTITY_SOURCES).toEqual(['camera', 'enrollment', 'manual', 'import', 'merge', 'split']);
    expect(IDENTITY_PHOTO_KINDS).toEqual(['capture', 'enrollment', 'manual']);
  });

  it('should upload face photos as a plain organization file kind the actions accept', () => {
    // Not sensitive and not owner-only: `loadOrganizationPhotos` refuses both kinds.
    expect(FACE_SOURCE_KIND).toBe('face_source');
    expect(['profile_document', 'dsr_export', 'auth_capture', 'export', 'search', 'bulk_input']).not.toContain(FACE_SOURCE_KIND);
  });
});

describe('identity checks', () => {
  const check = (id: string) => {
    const found = IDENTITY_CHECKS.find((c) => c.id === id);
    return (values: Record<string, unknown>, saved: Record<string, unknown> = {}) =>
      (found?.when as (di: unknown) => boolean)({
        values,
        saved,
        changed: (name: string) => values[name] !== saved[name],
      });
  };

  it('should refuse a reserved status but keep one the identity already has', () => {
    const reserved = check('identityStatusReserved');
    expect(reserved({ status: 'verified' }, { status: 'unverified' })).toBe(true);
    expect(reserved({ status: 'merged' }, { status: 'unverified' })).toBe(true);
    expect(reserved({ status: 'archived' }, { status: 'unverified' })).toBe(false);
    expect(reserved({ status: 'verified' }, { status: 'verified' })).toBe(false);
  });

  it('should refuse a primary identity without a profile', () => {
    const primary = check('identityPrimaryNeedsProfile');
    expect(primary({ is_primary_for_profile: true, profile_id: null })).toBe(true);
    expect(primary({ is_primary_for_profile: true, profile_id: 'p1' })).toBe(false);
  });
});
