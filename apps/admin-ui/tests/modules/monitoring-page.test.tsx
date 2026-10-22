// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { detectionFaceState } from '../../src/fields/detection-face-state';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Detection screens over a fake Hasura: the list draws each face as what became of it (a new
 * identity's photo with its link, "Erased" for an erased person, an anonymized row and a photo
 * whose file is gone, "Unidentified" for a face never kept) without failing (Review Focus 3); the
 * list is an append-only log (keyset paging, no count query); an identity's and a profile's
 * Detections and Sessions tabs read their rows by the record.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const CAMERA = '22222222-2222-4222-8222-000000000001';
const LOBBY = '33333333-3333-4333-8333-000000000001';
const KNOWN_ID = '44444444-4444-4444-8444-000000000001';
const NEW_ID = '44444444-4444-4444-8444-000000000002';
const ERASED_ID = '44444444-4444-4444-8444-000000000003';
const ANNA = '55555555-5555-4555-8555-000000000001';
const NEW_PHOTO = '66666666-6666-4666-8666-000000000001';
const GONE_PHOTO = '66666666-6666-4666-8666-000000000002';

const detection = (n: number, more: Record<string, unknown>) => ({
  id: `77777777-7777-4777-8777-00000000000${n}`,
  thumbnail_file_id: null,
  detected_at: `2026-10-22T10:0${n}:00Z`,
  identity_id: null,
  profile_id: null,
  person_erased: false,
  is_new_identity: false,
  device_id: CAMERA,
  facility_id: null,
  area_id: LOBBY,
  access_point_id: null,
  confidence: 0.9,
  similarity: null,
  quality_score: 0.8,
  bbox: { x: 1, y: 2, width: 30, height: 40 },
  frame_width: 1280,
  frame_height: 720,
  created_at: '2026-10-22T10:00:00Z',
  ...more,
});

const DETECTIONS = [
  detection(1, { identity_id: KNOWN_ID, profile_id: ANNA, similarity: 0.7 }),
  detection(2, { identity_id: NEW_ID, is_new_identity: true, thumbnail_file_id: NEW_PHOTO }),
  detection(3, { identity_id: ERASED_ID, profile_id: ANNA, person_erased: true }),
  // Anonymized by retention: identity, thumbnail and box cleared.
  detection(4, { bbox: null }),
  // A face neither matched nor kept.
  detection(5, {}),
  // A new identity's crop whose file was deleted since.
  detection(6, { identity_id: NEW_ID, is_new_identity: true, thumbnail_file_id: GONE_PHOTO }),
];

const IDENTITIES = [
  { id: KNOWN_ID, code: 'IDENTITY-00001' },
  { id: NEW_ID, code: 'IDENTITY-00002' },
  { id: ERASED_ID, code: 'IDENTITY-00003' },
];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.includes('/presignedurl')) {
    return url.includes(GONE_PHOTO)
      ? new Response(JSON.stringify({ error: { message: 'file not found' } }), { status: 404 })
      : hasuraResponse({ url: `http://storage.test/${url.split('/').at(-2)}.jpg`, expiration: 60 });
  }
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 6 } } } });
  if (/\bitems: detections\(/.test(query)) return hasuraResponse({ data: { items: DETECTIONS } });
  if (/\bitems: identities\(/.test(query)) return hasuraResponse({ data: { items: IDENTITIES } });
  if (query.includes('identities_by_pk')) {
    return hasuraResponse({ data: { item: { ...IDENTITIES[0], status: 'verified', source: 'camera', profile_id: ANNA } } });
  }
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({
      data: { item: { id: ANNA, code: 'PROFILE-00001', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova', status: 'active', erased_at: null, processing_restricted: false } },
    });
  }
  if (/\bitems: profiles\(/.test(query)) {
    return hasuraResponse({ data: { items: [{ id: ANNA, last_name: 'Petrova', first_name: 'Anna' }] } });
  }
  if (/\bitems: devices\(/.test(query)) return hasuraResponse({ data: { items: [{ id: CAMERA, name: 'Lobby camera' }] } });
  if (/\bitems: areas\(/.test(query)) return hasuraResponse({ data: { items: [{ id: LOBBY, name: 'Lobby' }] } });
  void variables;
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

// The whole console mounts per test: allow it more than the default second under a busy run.
configure({ asyncUtilTimeout: 5000 });

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detection face', () => {
  it('should read what became of the face from the row', () => {
    expect(detectionFaceState('f', { identity_id: 'i', is_new_identity: true })).toEqual({ kind: 'photo', fileId: 'f', isNew: true });
    expect(detectionFaceState('f', { identity_id: 'i', person_erased: true })).toEqual({ kind: 'erased' });
    expect(detectionFaceState(null, { identity_id: 'i', bbox: {} })).toEqual({ kind: 'none' });
    expect(detectionFaceState(null, { identity_id: null, bbox: null })).toEqual({ kind: 'erased' });
    expect(detectionFaceState(null, { identity_id: null, is_new_identity: true, bbox: {} })).toEqual({ kind: 'erased' });
    expect(detectionFaceState(null, { identity_id: null, bbox: { x: 1 } })).toEqual({ kind: 'unidentified' });
  });
});

describe('detection list', () => {
  it('should show each face as what became of it, never an error (Review Focus 3)', async () => {
    renderAt('/detections');
    await screen.findAllByRole('link', { name: 'IDENTITY-00002' });
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(DETECTIONS.length);

    // The new identity's crop, with its badge and a link to the identity it created.
    const created = rows[1] as HTMLElement;
    expect((await within(created).findByAltText('Face seen by the camera')).getAttribute('src')).toBe(
      `http://storage.test/${NEW_PHOTO}.jpg`,
    );
    expect(within(created).getByText('New identity')).toBeDefined();
    expect(within(created).getByRole('link', { name: 'IDENTITY-00002' }).getAttribute('href')).toBe(`/identities/${NEW_ID}`);

    // An erased person, an anonymized row and a deleted crop all read "Erased".
    expect(within(rows[2] as HTMLElement).getByText('Erased')).toBeDefined();
    expect(within(rows[3] as HTMLElement).getByText('Erased')).toBeDefined();
    expect(await within(rows[5] as HTMLElement).findByText('Erased', {})).toBeDefined();
    expect(within(rows[4] as HTMLElement).getByText('Unidentified')).toBeDefined();
    expect(screen.queryByText('The file could not be opened.')).toBeNull();

    // The person column names the known person.
    expect(await within(rows[0] as HTMLElement).findByText('Petrova', {})).toBeDefined();
  });

  it('should show the first page of the log when mounted in StrictMode (G38, patched @burojs/react)', async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/detections']}>
          <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(await screen.findAllByRole('link', { name: 'IDENTITY-00002' })).not.toHaveLength(0);
  });

  it('should read the log newest first by keyset, without a count query', async () => {
    renderAt('/detections');
    await screen.findByRole('table');
    const reads = bodies().filter((body) => /\bitems: detections\(/.test(body.query));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads[0]?.query).toContain('detected_at');
    expect(bodies().some((body) => body.query.includes('detections_aggregate'))).toBe(false);
  });
});

describe('people tabs', () => {
  it('should list an identity’s detections and sessions by the identity', async () => {
    renderAt(`/identities/${KNOWN_ID}?sections=detections`);
    await waitFor(() =>
      expect(bodies().some((body) => /\bitems: detections\(/.test(body.query) && JSON.stringify(body.variables).includes(KNOWN_ID))).toBe(true),
    );
    renderAt(`/identities/${KNOWN_ID}?sections=sessions`);
    await waitFor(() =>
      expect(
        bodies().some((body) => /\bitems: tracking_sessions\(/.test(body.query) && JSON.stringify(body.variables).includes(KNOWN_ID)),
      ).toBe(true),
    );
  });

  it('should list a profile’s detections through the computed person of each detection', async () => {
    renderAt(`/profiles/${ANNA}?sections=detections`);
    await waitFor(() => {
      const read = bodies().find((body) => /\bitems: detections\(/.test(body.query));
      expect(JSON.stringify(read?.variables)).toContain(`"profile_id":{"_eq":"${ANNA}"}`);
    });
  });
});
