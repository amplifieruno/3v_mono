// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { facilityStorageKey } from '../../src/app/scope';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Floor plan screens: the image uploads into the organization's bucket as kind `floor_plan`,
 * an empty width and height are taken from the image, and the list follows the sidebar
 * facility picker.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const FLOOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const IMAGE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const PLANS = [
  { id: 'p1', facility_id: TOWER_F, area_id: FLOOR, name: 'Floor 2 plan' },
  { id: 'p2', facility_id: DEPOT_F, area_id: 'dock', name: 'Depot plan' },
].map((row) => ({
  ...row,
  level: null,
  image_file_id: null,
  width_px: 1200,
  height_px: 800,
  scale_m_per_px: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const graphqlBodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = () => graphqlBodies().filter((b) => b.query.trimStart().startsWith('mutation'));

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files')) return json({ processedFiles: [{ id: IMAGE }] }, 201);
  if (url.includes('/presignedurl'))
    return json({ url: 'http://storage.test/plan.png', expiration: 60 });
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: PLANS[0] } });
  if (query.includes('_aggregate'))
    return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (/\bitems: floor_plans\(/.test(query)) {
    const only = [TOWER_F, DEPOT_F].find((f) => text.includes(f));
    return hasuraResponse({
      data: { items: PLANS.filter((p) => !only || p.facility_id === only) },
    });
  }
  if (/\bitems: facilities\(/.test(query)) {
    return hasuraResponse({
      data: {
        items: [
          { id: TOWER_F, name: 'Nova Tower' },
          { id: DEPOT_F, name: 'Depot' },
        ],
      },
    });
  }
  return hasuraResponse({ data: { items: [] } });
}

/** jsdom decodes no images: this one "loads" at 1600 × 900 once given a source. */
class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1600;
  naturalHeight = 900;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
  vi.stubGlobal('Image', LoadedImage);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('floor plan form', () => {
  it('should upload the image as a floor plan and take its size', async () => {
    renderAt(`/floor-plans/create?prefill.facility_id=${TOWER_F}&prefill.area_id=${FLOOR}`);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Floor 2' },
    });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'floor-2.png', {
      type: 'image/png',
    });
    const upload = await screen.findByRole('button', { name: /Upload/ });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });

    const width = screen.getByRole('spinbutton', { name: /^Width/ }) as HTMLInputElement;
    await waitFor(() => expect(width.value).toBe('1600'));
    expect((screen.getByRole('spinbutton', { name: /^Height/ }) as HTMLInputElement).value).toBe(
      '900',
    );
    const [, init] =
      vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/v1/files')) ?? [];
    const body = init?.body as FormData;
    expect(body.get('bucket-id')).toBe(NOVA);
    expect(JSON.parse(String(body.get('metadata[]')))).toMatchObject({
      metadata: { kind: 'floor_plan' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({
      facility_id: TOWER_F,
      area_id: FLOOR,
      name: 'Floor 2',
      image_file_id: IMAGE,
      width_px: 1600,
      height_px: 900,
    });
  });

  it('should offer the image’s size when it differs from the stored one', async () => {
    renderAt(`/floor-plans/create?prefill.facility_id=${TOWER_F}&prefill.area_id=${FLOOR}`);
    const width = (await screen.findByRole('spinbutton', { name: /^Width/ })) as HTMLInputElement;
    fireEvent.change(width, { target: { value: '1200' } });
    const upload = await screen.findByRole('button', { name: /Upload/ });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    const file = new File([new Uint8Array([1])], 'plan.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Use the image’s 1600 px' }));
    expect(width.value).toBe('1600');
  });
});

describe('floor plan list', () => {
  it('should follow the sidebar facility picker', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt('/floor-plans');
    expect(await screen.findByRole('row', { name: /Depot plan/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Floor 2 plan/ })).toBeNull();
  });
});
