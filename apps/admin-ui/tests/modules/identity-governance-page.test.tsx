// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Identity governance on screen: the timeline names places and cameras, relationships show the
 * other identity from either side, merging says what moves and why it would be refused, a
 * rollback's review step says what comes back (it reads the merge from the flow's values), and
 * the camera stops once the last wanted photo is taken.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const KEPT = '66666666-6666-4666-8666-000000000001';
const OTHER = '66666666-6666-4666-8666-000000000002';
const MERGE = '77777777-7777-4777-8777-000000000001';
const FACILITY = '88888888-8888-4888-8888-000000000001';
const AREA = '88888888-8888-4888-8888-000000000002';
const CAMERA = '88888888-8888-4888-8888-000000000003';

const IDENTITY = {
  id: KEPT,
  code: 'IDENTITY-00001',
  primary_photo_file_id: null,
  status: 'unverified',
  profile_id: null,
  link_strength: null,
  is_primary_for_profile: false,
  linked_at: null,
  linked_by: null,
  source: 'camera',
  attributes: {},
  custom_fields: {},
  matching_enabled: true,
  is_synthetic: false,
  age: null,
  confidence: null,
  first_seen_at: null,
  last_seen_at: null,
  detection_count: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const count = (n: number) => ({ aggregate: { count: n } });

/** One identity as the merge review reads it. */
const previewRow = (id: string, code: string, profile: { code: string } | null, primary = false) => ({
  id,
  code,
  status: 'unverified',
  is_synthetic: false,
  primary_photo_file_id: null,
  profile_id: profile === null ? null : `${profile.code}-id`,
  is_primary_for_profile: primary,
  profile: profile === null ? null : { ...profile, first_name: 'Anna', last_name: 'Petrova', processing_restricted: false },
  identity_photos_aggregate: count(2),
  identity_embeddings_aggregate: count(2),
  watch_list_entries_aggregate: count(1),
  verification_requests_aggregate: count(0),
  identity_duplicate_candidates_by_identity_a_aggregate: count(0),
  identity_duplicate_candidates_by_identity_b_aggregate: count(1),
});

const MERGE_ROW = {
  id: MERGE,
  target_identity_id: KEPT,
  status: 'completed',
  reason: 'Same person',
  inherited_profile_id: null,
  inherited_primary: false,
  merged_by: null,
  created_at: '2026-10-20T20:33:05Z',
  rolled_back_at: null,
  rolled_back_by: null,
  updated_at: '2026-10-20T20:33:05Z',
};

const PAIR = '44444444-4444-4444-8444-000000000001';
const PAIR_ROW = {
  id: PAIR,
  identity_a_id: KEPT,
  identity_b_id: OTHER,
  similarity: 0.91,
  status: 'open',
  merge_id: null,
  detected_at: '2026-10-18T00:00:00Z',
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
};

/** Whether the merge review finds two different profiles (set per test). */
let conflicting = false;
/** Whether the kept identity already shares the other's profile, which is its primary identity (set per test). */
let sharedPrimary = false;
/** Whether the merge's kept identity was merged away later (set per test). */
let targetMerged = false;
/** Whether identity lists (the merge picker) offer the other identity (set per test). */
let pickable = false;

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> };
  if (query.includes('IdentityTimeline')) {
    return hasuraResponse({
      data: {
        identity_timeline: [
          {
            identity_id: KEPT, kind: 'location', occurred_at: '2026-10-20T12:00:00Z', facility_id: FACILITY, area_id: AREA,
            access_point_id: null, device_id: CAMERA, event_type: null, severity: null, title: null, visit_id: null,
            movement_type: 'entry', status: null,
          },
          {
            identity_id: OTHER, kind: 'session_started', occurred_at: '2026-10-20T11:00:00Z', facility_id: FACILITY,
            area_id: null, access_point_id: null, device_id: null, event_type: null, severity: null, title: null,
            visit_id: null, movement_type: null, status: 'completed',
          },
        ],
      },
    });
  }
  if (query.includes('PlaceNames')) {
    return hasuraResponse({
      data: {
        facilities: [{ id: FACILITY, name: 'Nova Tower' }],
        areas: [{ id: AREA, name: 'Main Entrance' }],
        access_points: [],
        devices: [{ id: CAMERA, name: 'Main Entrance Camera' }],
      },
    });
  }
  if (query.includes('IdentityRelationships')) {
    const side = (id: string, code: string) => ({ id, code, status: 'unverified', primary_photo_file_id: null });
    return hasuraResponse({
      data: {
        identity_relationships: [
          { id: 'r1', relation: 'companion', confidence: 0.8, note: 'Arrive together', identity_a: side(KEPT, 'IDENTITY-00001'), identity_b: side(OTHER, 'IDENTITY-00002') },
        ],
      },
    });
  }
  if (query.includes('IdentityMergePreview')) {
    return hasuraResponse({
      data: {
        identities: [
          previewRow(
            KEPT,
            'IDENTITY-00001',
            conflicting ? { code: 'PROFILE-00001' } : sharedPrimary ? { code: 'PROFILE-00002' } : null,
          ),
          previewRow(OTHER, 'IDENTITY-00002', { code: 'PROFILE-00002' }, sharedPrimary),
        ],
      },
    });
  }
  if (query.includes('MergeRollbackPreview')) {
    return hasuraResponse({
      data: {
        identity_merges: [
          {
            id: MERGE,
            status: 'completed',
            inherited_primary: false,
            inherited_profile: { code: 'PROFILE-00002', first_name: 'Anna', last_name: 'Petrova' },
            target_identity: { ...previewRow(KEPT, 'IDENTITY-00001', null), status: targetMerged ? 'merged' : 'unverified' },
            identity_merge_sources: [
              { previous_status: 'unverified', previous_is_primary: true, previous_profile: { code: 'PROFILE-00002', first_name: 'Anna', last_name: 'Petrova' }, source_identity: { ...previewRow(OTHER, 'IDENTITY-00002', null), status: 'merged' } },
            ],
            identity_duplicate_candidates_aggregate: count(1),
          },
        ],
      },
    });
  }
  if (pickable && /\bidentities\(/.test(query) && !query.includes('_by_pk') && !query.includes('_aggregate')) {
    return hasuraResponse({ data: { items: [{ ...IDENTITY, id: OTHER, code: 'IDENTITY-00002' }] } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('identity_duplicate_candidates_by_pk')) return hasuraResponse({ data: { item: PAIR_ROW } });
  if (query.includes('identity_merges_by_pk')) return hasuraResponse({ data: { item: MERGE_ROW } });
  if (query.includes('identities_by_pk')) return hasuraResponse({ data: { item: variables?.id === KEPT ? IDENTITY : null } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

/** Opens an item flow from the record page's More menu. */
async function openFromMenu(label: RegExp): Promise<HTMLElement> {
  fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
  return screen.findByRole('dialog');
}

beforeAll(installDomShims);

beforeEach(() => {
  conflicting = false;
  sharedPrimary = false;
  targetMerged = false;
  pickable = false;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('identity page', () => {
  it('should show the timeline with places and cameras by name, marking a merged identity’s entries', async () => {
    renderAt(`/identities/${KEPT}?sections=timeline`);
    const timeline = await screen.findByTestId('identity-timeline');
    await waitFor(() => expect(timeline.textContent).toContain('Entered Main Entrance'));
    expect(timeline.textContent).toContain('Camera: Main Entrance Camera');
    expect(timeline.textContent).toContain('Arrived at Nova Tower');
    expect(timeline.textContent).toContain('as a merged identity');
  });

  it('should list a relationship stored either way round with the other identity', async () => {
    renderAt(`/identities/${KEPT}?sections=relationships`);
    const row = await screen.findByTestId('identity-relationship');
    expect(within(row).getByRole('link', { name: 'IDENTITY-00002' })).toBeDefined();
    expect(row.textContent).toContain('Companion');
    expect(row.textContent).toContain('Arrive together');
  });
});

describe('merging', () => {
  it('should ask for the identities to merge into this one', async () => {
    renderAt(`/identities/${KEPT}`);
    await screen.findAllByRole('heading', { name: /IDENTITY-00001/ });
    const dialog = await openFromMenu(/^Merge into this identity/);
    expect(await within(dialog).findByText('Choose the identities to merge into IDENTITY-00001.')).toBeDefined();
  });

  it('should reach the review step with a chosen identity and say what moves there', async () => {
    // The step that crashed before 5f8731e: the picker read the record, which the review lacks (G35).
    pickable = true;
    renderAt(`/identities/${KEPT}`);
    await screen.findAllByRole('heading', { name: /IDENTITY-00001/ });
    const dialog = await openFromMenu(/^Merge into this identity/);
    fireEvent.click((await within(dialog).findAllByRole('combobox'))[0]!);
    fireEvent.click(await screen.findByRole('option', { name: /IDENTITY-00002/ }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(await within(dialog).findByTestId('identity-merge-moves')).toBeDefined();
    fireEvent.click(within(dialog).getAllByRole('button', { name: /^Merge into this identity$/ }).at(-1)!);
    await within(dialog).findByRole('button', { name: /^Back$/ });
    expect(await within(dialog).findByTestId('identity-merge-review')).toBeDefined();
    expect(within(dialog).queryByText(/could not be loaded/)).toBeNull();
    expect((await within(dialog).findByTestId('identity-merge-moves')).textContent).toContain('move to IDENTITY-00001');
  });

  it('should say what a pair’s merge moves, and the profile the kept identity takes over', async () => {
    renderAt(`/identity-duplicates/${PAIR}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Merge identities$/ }));
    const dialog = await screen.findByRole('dialog');
    const moves = await within(dialog).findByTestId('identity-merge-moves');
    expect(moves.textContent).toContain('2 photos, 2 face templates and 1 watch-list entries move to IDENTITY-00001.');
    expect(moves.textContent).toContain('IDENTITY-00001 takes over the profile Anna Petrova (PROFILE-00002).');
    // The review step says it again (it reads the pair from the flow's values, G35).
    fireEvent.click(within(dialog).getByRole('button', { name: /^Merge identities$/ }));
    await within(dialog).findByRole('button', { name: /^Back$/ });
    expect(await within(dialog).findByTestId('identity-merge-moves')).toBeDefined();
  });

  it('should say the kept identity takes over the primary flag when it already shares the profile', async () => {
    sharedPrimary = true;
    renderAt(`/identity-duplicates/${PAIR}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Merge identities$/ }));
    const moves = await within(await screen.findByRole('dialog')).findByTestId('identity-merge-moves');
    expect(moves.textContent).toContain(
      'IDENTITY-00001 becomes the primary identity of Anna Petrova (PROFILE-00002), as IDENTITY-00002 was.',
    );
    expect(moves.textContent).not.toContain('takes over the profile');
  });

  it('should say why the merge would be refused when the two belong to different profiles', async () => {
    conflicting = true;
    renderAt(`/identity-duplicates/${PAIR}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Merge identities$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/linked to different profiles: the merge would be refused/)).toBeDefined();
    expect(within(dialog).queryByTestId('identity-merge-moves')).toBeNull();
  });
});

describe('roll back', () => {
  it('should say what comes back, on the form and again on the review step', async () => {
    renderAt(`/identity-merges/${MERGE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Roll back$/ }));
    const dialog = await screen.findByRole('dialog');
    const effects = await within(dialog).findByTestId('merge-rollback-effects');
    expect(effects.textContent).toContain('IDENTITY-00001 gives up the profile Anna Petrova (PROFILE-00002)');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Roll back$/ }));
    await within(dialog).findByRole('button', { name: /^Back$/ });
    const review = await within(dialog).findByTestId('merge-rollback-review');
    expect(within(review).getByText('IDENTITY-00002')).toBeDefined();
    expect(review.textContent).toContain('(primary identity)');
  });

  it('should warn before sending when the kept identity was merged away later', async () => {
    targetMerged = true;
    renderAt(`/identity-merges/${MERGE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Roll back$/ }));
    const dialog = await screen.findByRole('dialog');
    const warning = await within(dialog).findByRole('alert');
    expect(warning.textContent).toContain('IDENTITY-00001 was itself merged into another identity later');
  });

  it('should not warn when the kept identity stands', async () => {
    renderAt(`/identity-merges/${MERGE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Roll back$/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('merge-rollback-effects');
    expect(within(dialog).queryByText(/was itself merged/)).toBeNull();
  });
});
