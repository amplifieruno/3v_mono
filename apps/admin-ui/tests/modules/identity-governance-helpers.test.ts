import { describe, expect, it } from 'vitest';
import { byDay, entryLine, severityVariant } from '../../src/blocks/identity-timeline/timeline-entry';
import { placeIdsOf, type TimelineEntry } from '../../src/blocks/identity-timeline/identity-timeline-query';
import { sqlRefusalDetail, sqlRefusals } from '../../src/data/sql-refusals';
import { splitChoiceOf, validateSplitPhotos } from '../../src/fields/split-photos-format';
import { templatesOf } from '../../src/fields/split-photos-query';
import { mergeSources } from '../../src/modules/people/identity-merge-ops';
import { mergeEffect, mergeProblems, mergeSides } from '../../src/modules/people/identity-merge-plan';
import type { MergeIdentity } from '../../src/modules/people/identity-merge-preview';
import { orderedPair } from '../../src/modules/people/identity-relationship-ops';
import { relatedFrom } from '../../src/modules/people/identity-relationships-query';

/** The pure parts of identity governance: merge planning, refusals, split choice, timeline lines. */

const identity = (id: string, over: Partial<MergeIdentity> = {}): MergeIdentity => ({
  id,
  code: `IDENTITY-${id}`,
  status: 'unverified',
  is_synthetic: false,
  primary_photo_file_id: null,
  profile_id: null,
  is_primary_for_profile: false,
  profile: null,
  profile_restricted: false,
  photos: 2,
  templates: 2,
  watch_list_entries: 1,
  pending_verifications: 0,
  open_pairs: 1,
  ...over,
});

describe('merge planning', () => {
  it('should keep the chosen side of a pair and merge the other into it', () => {
    expect(mergeSides({ first: 'a', second: 'b', keep: 'second' })).toEqual({ targetId: 'b', sourceIds: ['a'] });
    expect(mergeSides({ first: 'a', second: 'b', keep: 'first' })).toEqual({ targetId: 'a', sourceIds: ['b'] });
    expect(mergeSides({ first: 'a', second: 'b', keep: null })).toEqual({ targetId: null, sourceIds: ['a', 'b'] });
  });

  it('should leave the kept identity and repeats out of the sources', () => {
    expect(mergeSides({ targetId: 'a', sourceIds: ['b', 'a', 'b', 'c'] })).toEqual({ targetId: 'a', sourceIds: ['b', 'c'] });
    expect(mergeSources('a', ['b', 'a', 'b'])).toEqual(['b']);
  });

  it('should say before sending why the database would refuse the merge', () => {
    const target = identity('1', { profile_id: 'p1', profile: 'Anna Petrova (PROFILE-1)' });
    expect(mergeProblems(target, [identity('2', { profile_id: 'p2' })])).toEqual([{ kind: 'profiles' }]);
    expect(mergeProblems(target, [identity('2', { status: 'merged' })])).toEqual([{ kind: 'merged', code: 'IDENTITY-2' }]);
    expect(mergeProblems(target, [identity('2', { is_synthetic: true })])).toEqual([{ kind: 'synthetic' }]);
    expect(mergeProblems(target, [identity('2', { profile_id: 'p1' })])).toEqual([]);
  });

  it('should total what moves and say which profile the kept identity takes over', () => {
    const effect = mergeEffect(identity('1'), [identity('2', { profile_id: 'p2', profile: 'Ivan (PROFILE-2)' }), identity('3')]);
    expect(effect).toEqual({
      photos: 4,
      templates: 4,
      watchListEntries: 2,
      openPairs: 2,
      pendingVerifications: 0,
      inheritedProfile: 'Ivan (PROFILE-2)',
      inheritedPrimaryFrom: null,
    });
    expect(mergeEffect(identity('1', { profile_id: 'p1' }), [identity('2', { profile: 'x' })]).inheritedProfile).toBeNull();
  });

  it('should name the merged identity whose primary flag the kept one takes over', () => {
    const primary = identity('2', { profile_id: 'p1', is_primary_for_profile: true });
    // The kept identity already shares the profile: no profile is taken over, the primary flag is.
    const shared = mergeEffect(identity('1', { profile_id: 'p1' }), [primary]);
    expect(shared).toMatchObject({ inheritedProfile: null, inheritedPrimaryFrom: 'IDENTITY-2' });
    // The kept identity is already primary: nothing to take over.
    expect(mergeEffect(identity('1', { profile_id: 'p1', is_primary_for_profile: true }), [primary]).inheritedPrimaryFrom).toBeNull();
    expect(mergeEffect(identity('1'), [identity('2')]).inheritedPrimaryFrom).toBeNull();
  });
});

describe('SQL refusals', () => {
  const read = sqlRefusals({ merge_rows_moved: (n) => `${n} moved.`, pair_key: 'Already related.' });

  it('should read the detail of a refused statement and nothing else', () => {
    expect(sqlRefusalDetail('Check constraint violation. merge_source_is_target')).toBe('merge_source_is_target');
    expect(sqlRefusalDetail('Uniqueness violation. duplicate key "x"')).toBe('duplicate key "x"');
    expect(sqlRefusalDetail('database query error')).toBeNull();
  });

  it('should answer a known code, a known constraint and any other refusal', () => {
    expect(read({ code: 'permission-error', message: 'Check constraint violation. merge_rows_moved:2' }, {})).toEqual([
      { code: 'merge_rows_moved', message: '2 moved.', path: [] },
    ]);
    expect(read({ code: 'constraint-violation', message: 'Uniqueness violation. violates "pair_key"' }, {})?.[0]?.code).toBe(
      'pair_key',
    );
    expect(read({ code: 'permission-error', message: 'Check constraint violation. other_code' }, {})?.[0]).toMatchObject({
      code: 'database_refused',
      message: 'The database refused the change: other_code. Nothing was changed.',
    });
    expect(read({ code: 'unexpected', message: 'connection reset' }, {})).toBeNull();
    // A constraint is matched only where the database quotes its name; a code only exactly.
    expect(read({ code: 'constraint-violation', message: 'Uniqueness violation. violates pair_key_2' }, {})?.[0]?.code).toBe(
      'database_refused',
    );
    expect(read({ code: 'permission-error', message: 'Check constraint violation. merge_rows_moved_twice' }, {})?.[0]?.code).toBe(
      'database_refused',
    );
  });
});

describe('split choice', () => {
  it('should start from the identity’s id and refuse a split without a photo', () => {
    expect(splitChoiceOf('id-1')).toEqual({ identityId: 'id-1', photos: [], embeddingIds: [] });
    expect(validateSplitPhotos('id-1')?.code).toBe('splitPhotos.none');
    expect(validateSplitPhotos({ identityId: 'id-1', photos: [{ id: 'p', fileId: 'f' }], embeddingIds: [] })).toBeNull();
  });

  it('should move the face templates computed from the chosen photos', () => {
    const parts = {
      photos: [],
      templates: [
        { id: 't1', photo_file_id: 'f1' },
        { id: 't2', photo_file_id: 'f2' },
        { id: 't3', photo_file_id: null },
      ],
    };
    expect(templatesOf(parts, ['f2'])).toEqual(['t2']);
  });
});

describe('relationships', () => {
  it('should store a pair once, smaller id first, whichever side adds it', () => {
    expect(orderedPair('b', 'a')).toEqual({ a: 'a', b: 'b' });
    expect(orderedPair('a', 'b')).toEqual({ a: 'a', b: 'b' });
  });

  it('should show the other identity of the pair from either side', () => {
    const side = (id: string) => ({ id, code: id.toUpperCase(), status: 'unverified', primary_photo_file_id: null });
    const rows = [{ id: 'r', relation: 'related', confidence: null, note: null, identity_a: side('a'), identity_b: side('b') }];
    expect(relatedFrom(rows, 'a')[0]?.other.code).toBe('B');
    expect(relatedFrom(rows, 'b')[0]?.other.code).toBe('A');
  });
});

describe('timeline entries', () => {
  const entry = (over: Partial<TimelineEntry>): TimelineEntry => ({
    identity_id: 'i',
    kind: 'location',
    occurred_at: '2026-10-20T19:00:00Z',
    facility_id: 'f',
    area_id: 'a',
    access_point_id: null,
    device_id: 'd',
    event_type: null,
    severity: null,
    title: null,
    visit_id: null,
    movement_type: 'entry',
    status: null,
    ...over,
  });
  const names = { f: 'Nova Tower', a: 'Lobby', d: 'Lobby camera' };

  it('should say what happened where, by name', () => {
    expect(entryLine(entry({}), names, '?')).toMatchObject({ key: 'kind_entry', params: { area: 'Lobby' } });
    expect(entryLine(entry({ movement_type: 'movement' }), names, '?').key).toBe('kind_location');
    expect(entryLine(entry({ kind: 'session_ended', status: 'lost' }), names, '?')).toMatchObject({
      key: 'kind_session_lost',
      params: { facility: 'Nova Tower' },
    });
    expect(entryLine(entry({ kind: 'event', title: 'Access granted: Turnstile 3' }), names, '?').params.title).toBe(
      'Access granted: Turnstile 3',
    );
    expect(entryLine(entry({ area_id: 'gone' }), names, 'unknown place').params.area).toBe('unknown place');
  });

  it('should group by day, read each place once and colour severities', () => {
    const entries = [
      entry({ occurred_at: '2026-10-20T12:00:00Z' }),
      entry({ occurred_at: '2026-10-20T11:00:00Z', area_id: 'b' }),
      entry({ occurred_at: '2026-10-10T12:00:00Z' }),
    ];
    expect(byDay(entries).map((day) => day.entries.length)).toEqual([2, 1]);
    expect(placeIdsOf(entries)).toEqual({ facilities: ['f'], areas: ['a', 'b'], accessPoints: [], devices: ['d'] });
    expect(severityVariant('critical')).toBe('destructive');
    expect(severityVariant('info')).toBe('outline');
  });
});
