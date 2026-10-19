import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import type { ExtractedFace, InsightFaceClient } from '../face/insightFaceClient.js';
import type { StorageClient } from '../storage/storageClient.js';
import { SearchError } from './options.js';
import { runSearch, type SearchDeps } from './searchService.js';

const ORG = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const USER = '33333333-3333-4333-8333-333333333333';
const FILE = '22222222-2222-4222-8222-222222222222';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const IDENTITY = '55555555-5555-4555-8555-555555555555';

let image: Buffer;
beforeAll(async () => {
  image = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#888' } }).png().toBuffer();
});

type FileRow = { id: string; bucketId: string; mimeType: string; size: number; metadata: unknown; uploadedByUserId: string | null };

function ownFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: FILE, bucketId: ORG.toLowerCase(), mimeType: 'image/png', size: 1000, metadata: { kind: 'search' },
    uploadedByUserId: USER, ...overrides,
  };
}

function setup(options: { file?: FileRow | null; faces?: ExtractedFace[]; matches?: unknown[] } = {}) {
  const adminCalls: { query: string; variables: Record<string, unknown> }[] = [];
  const actorCalls: { query: string; variables: Record<string, unknown> }[] = [];
  const admin = {
    request: vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
      adminCalls.push({ query, variables });
      if (query.includes('SearchSettings')) return { organization_settings_by_pk: { recognition_threshold: 0.5 } };
      if (query.includes('SearchImageFile')) return { file: options.file === undefined ? ownFile() : options.file };
      if (query.includes('search_identities')) {
        return {
          search_identities: options.matches ?? [
            { identity_id: IDENTITY, profile_id: null, rank: 1, confidence: 0.81, match_type: 'exact' },
          ],
        };
      }
      throw new Error(`unexpected admin query ${query}`);
    }),
  } as unknown as HasuraClient;
  const actor = {
    request: vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
      actorCalls.push({ query, variables });
      if (query.includes('InsertSearchRequest')) return { insert_search_requests_one: { id: REQUEST } };
      if (query.includes('StartSearchRequest')) return { update_search_requests_by_pk: { id: REQUEST } };
      if (query.includes('CompleteSearchRequest')) return { insert_search_results: { affected_rows: 1 }, update_search_requests_by_pk: { id: REQUEST } };
      if (query.includes('FailSearchRequest')) return { update_search_requests_by_pk: { id: REQUEST } };
      throw new Error(`unexpected actor query ${query}`);
    }),
  } as unknown as HasuraClient;
  const storage = { download: vi.fn(async () => image), upload: vi.fn(), deleteFile: vi.fn(), presignedUrl: vi.fn() };
  const faces = options.faces ?? [{ bbox: [50, 50, 170, 170], score: 0.99, embedding: [0.1, 0.2] } as ExtractedFace];
  const insightFace: InsightFaceClient = { extract: vi.fn(async () => faces) };
  const deps: SearchDeps = { admin, actor, storage: storage as unknown as StorageClient, insightFace };
  return { deps, adminCalls, actorCalls, storage, insightFace };
}

const facial = { organizationId: ORG, userId: USER, input: { searchType: 'facial', imageFileId: FILE } };

describe('runSearch', () => {
  it('should write the request as the caller, move it through running to completed and store the results', async () => {
    const { deps, actorCalls, adminCalls } = setup();
    const outcome = await runSearch(deps, facial);
    expect(outcome).toMatchObject({
      searchRequestId: REQUEST, status: 'completed', resultsCount: 1, topConfidence: 0.81, faceCount: 1, error: null,
    });
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);

    const insert = actorCalls.find((c) => c.query.includes('InsertSearchRequest'));
    expect(insert?.variables.object).toMatchObject({
      organization_id: ORG.toLowerCase(), user_id: USER, search_type: 'facial', image_file_id: FILE, status: 'queued',
      threshold: 0.5, max_results: 20, fuzzy: false, filters: {},
    });
    expect(actorCalls.map((c) => c.query.match(/mutation (\w+)/)?.[1])).toEqual([
      'InsertSearchRequest', 'StartSearchRequest', 'CompleteSearchRequest',
    ]);
    const complete = actorCalls[2].variables;
    expect(complete.results).toEqual([
      { organization_id: ORG.toLowerCase(), search_request_id: REQUEST, identity_id: IDENTITY, profile_id: null, rank: 1, confidence: 0.81, match_type: 'exact' },
    ]);
    const search = adminCalls.find((c) => c.query.includes('search_identities'));
    expect(search?.variables).toMatchObject({ org: ORG.toLowerCase(), embedding: '[0.1,0.2]', threshold: 0.5, limit: 20, fuzzy: false });
  });

  it('should search with the largest face when the image has several and report the face count', async () => {
    const faces = [
      { bbox: [0, 0, 40, 40], score: 0.99, embedding: [1] },
      { bbox: [40, 40, 190, 190], score: 0.99, embedding: [2] },
    ] as ExtractedFace[];
    const { deps, adminCalls } = setup({ faces });
    const outcome = await runSearch(deps, facial);
    expect(outcome.faceCount).toBe(2);
    expect(adminCalls.find((c) => c.query.includes('search_identities'))?.variables.embedding).toBe('[2]');
  });

  it('should record a failed request when the image has no face', async () => {
    const { deps, actorCalls } = setup({ faces: [] });
    const outcome = await runSearch(deps, facial);
    expect(outcome).toMatchObject({ status: 'failed', error: 'no_face', resultsCount: 0, faceCount: 0 });
    const fail = actorCalls.find((c) => c.query.includes('FailSearchRequest'));
    expect(fail?.variables).toMatchObject({ id: REQUEST, error: 'no_face', faceCount: 0 });
  });

  it('should record low_quality when the largest face is too poor', async () => {
    const { deps } = setup({ faces: [{ bbox: [0, 0, 8, 8], score: 0.55, embedding: [1] } as ExtractedFace] });
    expect(await runSearch(deps, facial)).toMatchObject({ status: 'failed', error: 'low_quality', faceCount: 1 });
  });

  it('should refuse files outside the organization, sensitive files and other users\' search images before writing', async () => {
    for (const file of [
      null,
      ownFile({ bucketId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      ownFile({ metadata: { kind: 'profile_document' } }),
      ownFile({ uploadedByUserId: '66666666-6666-4666-8666-666666666666' }),
    ]) {
      const { deps, actorCalls } = setup({ file });
      await expect(runSearch(deps, facial)).rejects.toMatchObject({ code: 'file_not_found' });
      expect(actorCalls).toHaveLength(0);
    }
  });

  it('should accept an organization image of another kind (e.g. a capture) from any member', async () => {
    const { deps } = setup({ file: ownFile({ metadata: { kind: 'identity_photo' }, uploadedByUserId: null }) });
    expect((await runSearch(deps, facial)).status).toBe('completed');
  });

  it('should run an attribute search without InsightFace, ordered by the SQL function', async () => {
    const { deps, insightFace, storage, adminCalls } = setup({
      matches: [
        { identity_id: IDENTITY, profile_id: null, rank: 1, confidence: null, match_type: 'exact' },
      ],
    });
    const outcome = await runSearch(deps, {
      organizationId: ORG, userId: USER, input: { searchType: 'attribute', filters: { gender: 'female' } },
    });
    expect(outcome).toMatchObject({ status: 'completed', resultsCount: 1, topConfidence: null, faceCount: null });
    expect(insightFace.extract).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
    expect(adminCalls.find((c) => c.query.includes('search_identities'))?.variables).toMatchObject({
      embedding: null, threshold: null, filters: { gender: 'female' },
    });
  });

  it('should link a saved-search run to its saved search', async () => {
    const { deps, actorCalls } = setup();
    await runSearch(deps, { ...facial, savedSearchId: REQUEST });
    expect(actorCalls[0].variables.object).toMatchObject({ saved_search_id: REQUEST });
  });

  it('should mark the request failed and rethrow on an unexpected error', async () => {
    const { deps, actorCalls } = setup();
    vi.mocked(deps.insightFace.extract).mockRejectedValueOnce(new Error('insightface down'));
    await expect(runSearch(deps, facial)).rejects.toThrow('insightface down');
    expect(actorCalls.find((c) => c.query.includes('FailSearchRequest'))?.variables.error).toMatch(/insightface down/);
  });

  it('should raise SearchError for invalid options', async () => {
    const { deps } = setup();
    await expect(runSearch(deps, { ...facial, input: { searchType: 'facial' } })).rejects.toBeInstanceOf(SearchError);
  });
});
