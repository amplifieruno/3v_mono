// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Identities and enrollment on screen: enrolling a face uploads each photo, then shows which
 * photo the platform refused and why, both when some photos were saved and when none was
 * (Review Focus 1); the camera says when it is refused and stops when the dialog closes; the
 * identity page shows its photos, and a merged identity is locked with the reason.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const ANNA = '33333333-3333-4333-8333-000000000001';
const FACE = '66666666-6666-4666-8666-000000000001';
const MERGED = '66666666-6666-4666-8666-000000000002';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const CROP = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const PROFILE = {
  id: ANNA,
  code: 'PROFILE-00001',
  profile_type: 'employee',
  first_name: 'Anna',
  last_name: 'Petrova',
  status: 'active',
  email: null,
  phone: null,
  company_id: null,
  employee_id: null,
  department: null,
  job_title: null,
  work_schedule_id: null,
  access_level: 'basic',
  start_date: null,
  end_date: null,
  avatar_file_id: null,
  external_id: null,
  notes: null,
  custom_fields: {},
  has_face: true,
  identities_count: 1,
  is_blacklisted: false,
  processing_restricted: false,
  restricted_at: null,
  restricted_by: null,
  restriction_reason: null,
  erased_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const IDENTITY = {
  id: FACE,
  code: 'IDENTITY-00012',
  primary_photo_file_id: CROP,
  status: 'unverified',
  profile_id: ANNA,
  link_strength: 1,
  is_primary_for_profile: true,
  linked_at: '2026-10-01T00:00:00Z',
  linked_by: null,
  source: 'enrollment',
  attributes: { age: 34 },
  custom_fields: {},
  matching_enabled: true,
  is_synthetic: false,
  age: 34,
  confidence: null,
  first_seen_at: '2026-10-02T08:00:00Z',
  last_seen_at: '2026-10-21T17:30:00Z',
  detection_count: 42,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const OFF = '66666666-6666-4666-8666-000000000003';

const IDENTITIES = [
  IDENTITY,
  { ...IDENTITY, id: MERGED, code: 'IDENTITY-00013', status: 'merged', profile_id: null },
  { ...IDENTITY, id: OFF, code: 'IDENTITY-00014', matching_enabled: false },
];

const PHOTOS = [
  { id: 'ph1', file_id: CROP, kind: 'enrollment', quality_score: 0.83, captured_at: null, created_at: '2026-10-01T00:00:00Z', device: null },
  { id: 'ph2', file_id: 'cccccccc-cccc-4ccc-8ccc-000000000002', kind: 'capture', quality_score: 0.41, captured_at: '2026-10-21T17:30:00Z', created_at: '2026-10-21T17:30:01Z', device: { name: 'Lobby camera' } },
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

const mutations = (name: string): GraphqlBody[] =>
  bodies().filter((body) => body.query.trimStart().startsWith('mutation') && body.query.includes(name));

/** What `enroll_face` answers in a test; set per test. */
let enrollAnswer: unknown;
let uploads: string[];

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files') && init?.method === 'POST') {
    const id = uploads.shift() ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    return hasuraResponse({ processedFiles: [{ id }] });
  }
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `https://files.test/${url.split('/').at(-2)}`, expiration: 60 });
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('enroll_face')) return hasuraResponse(enrollAnswer);
  if (query.includes('IdentityPhotos')) {
    return hasuraResponse({ data: { identity_photos: PHOTOS, identity_photos_aggregate: { aggregate: { count: 2 } } } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('profiles_by_pk')) return hasuraResponse({ data: { item: PROFILE } });
  if (query.includes('identities_by_pk')) {
    return hasuraResponse({ data: { item: IDENTITIES.find((i) => i.id === variables?.id) ?? null } });
  }
  if (/\bitems: identities\(/.test(query)) return hasuraResponse({ data: { items: [IDENTITY] } });
  if (/\bitems: profiles\(/.test(query)) return hasuraResponse({ data: { items: [PROFILE] } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

/** Opens "Enroll face" on Anna's profile and picks two photos; answers the dialog. */
async function enrollTwoPhotos(): Promise<HTMLElement> {
  renderAt(`/profiles/${ANNA}`);
  fireEvent.click(await screen.findByRole('button', { name: /^Enroll face$/ }));
  const dialog = await screen.findByRole('dialog');
  const photos = [
    new File(['jpeg-1'], 'front.jpg', { type: 'image/jpeg' }),
    new File(['jpeg-2'], 'side.jpg', { type: 'image/jpeg' }),
  ];
  fireEvent.change(await within(dialog).findByLabelText(/^Photos/), { target: { files: photos } });
  await within(dialog).findByRole('img', { name: 'Photo 2' });
  return dialog;
}

beforeAll(installDomShims);

beforeEach(() => {
  uploads = [P1, P2];
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enroll face (Review Focus 1)', () => {
  it('should upload each photo, then name the refused photo and the reason next to what was saved', async () => {
    enrollAnswer = {
      data: {
        enroll_face: {
          identity_id: FACE,
          identity_code: 'IDENTITY-00012',
          photos_added: 1,
          templates: 3,
          rejected: [{ file_id: P2, reason: 'low_quality' }],
        },
      },
    };
    const dialog = await enrollTwoPhotos();
    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith('/v1/files') && init?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(String((posts[0]?.[1]?.body as FormData).get('metadata[]'))).toContain('"kind":"face_source"');
    expect((posts[0]?.[1]?.body as FormData).get('bucket-id')).toBe(NOVA);

    fireEvent.click(within(dialog).getByRole('button', { name: /^Enroll face$/ }));
    const result = await within(dialog).findByTestId('enrollment-result');
    expect(mutations('enroll_face')[0]?.variables).toEqual({ profile: ANNA, files: [P1, P2] });
    expect(result.textContent).toContain('1 of 2 photos added to IDENTITY-00012.');
    const refused = within(result).getByTestId('enrollment-rejected');
    expect(refused.textContent).toBe('Photo 2: the face is too small, blurred, dark or turned away');
  });

  it('should keep the form and say photo by photo why nothing was saved', async () => {
    enrollAnswer = {
      errors: [
        {
          message: `No usable face in the photos (${P1}: no_face, ${P2}: multiple_faces)`,
          extensions: { code: 'no_valid_photos' },
        },
      ],
    };
    const dialog = await enrollTwoPhotos();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Enroll face$/ }));
    expect(
      await within(dialog).findByText(
        'No photo shows a usable face, so nothing was saved. Photo 1: no face found. Photo 2: more than one face; use a photo of the person alone.',
      ),
    ).toBeDefined();
    expect(within(dialog).queryByTestId('enrollment-result')).toBeNull();
    // Not the "may have been applied" screen: the form is still there to fix the photos.
    expect(within(dialog).queryByText(/may have been applied/)).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Remove photo 1' })).toBeDefined();
  });
});

describe('camera', () => {
  it('should say when the browser refuses the camera', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    renderAt(`/profiles/${ANNA}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Enroll face$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Use camera' }));
    expect(await within(dialog).findByText(/The browser was not allowed to use the camera/)).toBeDefined();
  });

  it('should stop the camera when the dialog closes', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    renderAt(`/profiles/${ANNA}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Enroll face$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Use camera' }));
    expect(await within(dialog).findByRole('button', { name: 'Take photo' })).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Cancel$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('camera at the photo limit', () => {
  it('should stop the camera once the last wanted photo is added', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    uploads = Array.from({ length: 5 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000010${i}`);
    renderAt(`/profiles/${ANNA}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Enroll face$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Use camera' }));
    expect(await within(dialog).findByRole('button', { name: 'Take photo' })).toBeDefined();
    const files = Array.from({ length: 5 }, (_, i) => new File([`jpeg-${i}`], `face-${i}.jpg`, { type: 'image/jpeg' }));
    fireEvent.change(await within(dialog).findByLabelText(/^Photos/), { target: { files } });
    await within(dialog).findByRole('img', { name: 'Photo 5' });
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(within(dialog).queryByRole('button', { name: 'Take photo' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Use camera' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('identity pages', () => {
  it('should list the person’s identities on the profile', async () => {
    renderAt(`/profiles/${ANNA}?sections=identities`);
    expect(await screen.findByRole('row', { name: /IDENTITY-00012/ })).toBeDefined();
  });

  it('should say when matching is off, and only then', async () => {
    renderAt(`/identities/${OFF}`);
    expect(await screen.findByRole('heading', { name: 'Matching off' })).toBeDefined();
    cleanup();
    renderAt(`/identities/${FACE}`);
    await screen.findAllByRole('heading', { name: /IDENTITY-00012/ });
    expect(screen.queryByRole('heading', { name: 'Matching off' })).toBeNull();
  });

  it('should show the identity’s photos with their kind, quality and camera', async () => {
    renderAt(`/identities/${FACE}?sections=photos`);
    const gallery = await screen.findByTestId('photo-gallery');
    const cards = within(gallery).getAllByTestId('gallery-photo');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('Quality 0.83');
    expect(cards[0]?.textContent).toContain('Primary');
    expect(cards[1]?.textContent).toContain('Lobby camera');
  });

  it('should lock a merged identity with the reason', async () => {
    renderAt(`/identities/${MERGED}`);
    await screen.findAllByRole('heading', { name: /IDENTITY-00013/ });
    const edit = await screen.findByRole('button', { name: /^Edit/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: /^Add photos/ }).getAttribute('aria-disabled')).toBe('true');
  });
});
