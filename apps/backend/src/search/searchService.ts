import { normalizeImage, vectorLiteral } from '../face/enrollmentSteps.js';
import type { InsightFaceClient } from '../face/insightFaceClient.js';
import { InvalidImageError, MAX_PHOTO_BYTES } from '../face/photoSources.js';
import { MIN_QUALITY, qualityScore } from '../face/quality.js';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { OWNER_ONLY_FILE_KINDS, SENSITIVE_FILE_KINDS, type StorageClient } from '../storage/storageClient.js';
import { largestFace, resolveSearchOptions, SearchError, type SearchInput, type SearchOptions } from './options.js';

/**
 * Search core (spec §8.5 search_faces), shared by the action, the run_saved_searches cron and bulk_search:
 * image file (organization bucket; a `search` kind file only of the searching user) -> InsightFace (largest face,
 * quality check) -> itap.search_identities -> search_requests + search_results written through `actor` (admin rights
 * with the searching user's session, so audit rows record them). Request states: queued -> running -> completed |
 * failed (error, e.g. no_face / low_quality / invalid_image). Input problems throw SearchError before anything is
 * written; unexpected failures after the request exists mark it failed (best effort) and rethrow.
 */
export type SearchDeps = {
  /** Admin secret without a session: file and settings lookups, search_identities. */
  admin: HasuraClient;
  /** Admin rights with the searching user's user/org headers: every write. */
  actor: HasuraClient;
  storage: StorageClient;
  insightFace: InsightFaceClient;
};

export type SearchRun = {
  organizationId: string;
  /** The member the request belongs to (owner-only history). */
  userId: string;
  savedSearchId?: string;
  input: SearchInput;
};

export type SearchOutcome = {
  searchRequestId: string;
  status: 'completed' | 'failed';
  resultsCount: number;
  topConfidence: number | null;
  durationMs: number;
  faceCount: number | null;
  error: string | null;
};

type FileRow = {
  id: string;
  bucketId: string;
  mimeType: string | null;
  size: number | null;
  metadata: { kind?: unknown } | null;
  uploadedByUserId: string | null;
  isUploaded: boolean | null;
};
type Match = { identity_id: string; profile_id: string | null; rank: number; confidence: number | null; match_type: string };

const SETTINGS = `
  query SearchSettings($org: uuid!) { organization_settings_by_pk(organization_id: $org) { recognition_threshold } }
`;
const FILE = `
  query SearchImageFile($id: uuid!) { file(id: $id) { id bucketId mimeType size metadata uploadedByUserId isUploaded } }
`;
const INSERT = `
  mutation InsertSearchRequest($object: search_requests_insert_input!) { insert_search_requests_one(object: $object) { id } }
`;
const START = `
  mutation StartSearchRequest($id: uuid!, $at: timestamptz!) {
    update_search_requests_by_pk(pk_columns: { id: $id }, _set: { status: running, started_at: $at }) { id }
  }
`;
const SEARCH = `
  query SearchIdentities($org: uuid!, $embedding: String, $threshold: Float, $limit: Int!, $filters: jsonb!, $fuzzy: Boolean!) {
    search_identities(args: {
      p_org: $org, p_embedding: $embedding, p_threshold: $threshold, p_limit: $limit, p_filters: $filters, p_fuzzy: $fuzzy
    }) { identity_id profile_id rank confidence match_type }
  }
`;
const COMPLETE = `
  mutation CompleteSearchRequest($id: uuid!, $results: [search_results_insert_input!]!, $set: search_requests_set_input!) {
    insert_search_results(objects: $results) { affected_rows }
    update_search_requests_by_pk(pk_columns: { id: $id }, _set: $set) { id }
  }
`;
const FAIL = `
  mutation FailSearchRequest($id: uuid!, $error: String!, $faceCount: Int, $durationMs: Int!, $at: timestamptz!) {
    update_search_requests_by_pk(
      pk_columns: { id: $id }
      _set: { status: failed, error: $error, face_count: $faceCount, duration_ms: $durationMs, completed_at: $at }
    ) { id }
  }
`;

/** A request-level failure recorded on the request (not an exception for the caller). */
class SearchFailure extends Error {
  readonly faceCount: number | null;

  constructor(code: string, faceCount: number | null) {
    super(code);
    this.faceCount = faceCount;
  }
}

function fileKind(file: FileRow): string | undefined {
  return typeof file.metadata?.kind === 'string' ? file.metadata.kind : undefined;
}

/** Organization file usable by `userId` as a search image (else file_not_found: nothing is disclosed). */
async function loadImageFile(admin: HasuraClient, organizationId: string, userId: string, fileId: string): Promise<FileRow> {
  const { file } = await admin.request<{ file: FileRow | null }>(FILE, { id: fileId });
  const kind = file ? fileKind(file) : undefined;
  if (
    !file ||
    file.bucketId !== organizationId ||
    (kind !== undefined && SENSITIVE_FILE_KINDS.has(kind)) ||
    (kind !== undefined && OWNER_ONLY_FILE_KINDS.has(kind) && file.uploadedByUserId?.toLowerCase() !== userId.toLowerCase())
  ) {
    throw new SearchError('file_not_found', 'File not found');
  }
  return file;
}

/** Maps a refused request insert (SQL checks) onto business errors. */
function insertError(error: unknown): unknown {
  if (!(error instanceof HasuraError)) return error;
  const text = `${error.message} ${error.detail ?? ''}`;
  if (/search_filters_invalid|filters_valid/.test(text)) return new SearchError('invalid_filters', 'Invalid search filters');
  if (/search_image_not_found|file_not_in_org_bucket/.test(text)) return new SearchError('file_not_found', 'File not found');
  return error;
}

async function extractEmbedding(deps: SearchDeps, file: FileRow): Promise<{ embedding: number[]; faceCount: number }> {
  let normalized: Awaited<ReturnType<typeof normalizeImage>>;
  try {
    if (file.isUploaded !== true) throw new InvalidImageError('Upload not completed');
    if (!file.mimeType?.startsWith('image/') || (file.size ?? 0) > MAX_PHOTO_BYTES) throw new InvalidImageError('Not an image');
    normalized = await normalizeImage(await deps.storage.download(file.id));
  } catch (error: unknown) {
    if (error instanceof InvalidImageError) throw new SearchFailure('invalid_image', null);
    throw error;
  }
  const faces = await deps.insightFace.extract(normalized.image);
  const face = largestFace(faces);
  if (!face) throw new SearchFailure('no_face', 0);
  if (qualityScore(face, normalized.width, normalized.height) < MIN_QUALITY) throw new SearchFailure('low_quality', faces.length);
  return { embedding: face.embedding, faceCount: faces.length };
}

export async function runSearch(deps: SearchDeps, run: SearchRun): Promise<SearchOutcome> {
  const startedAt = Date.now();
  const organizationId = run.organizationId.toLowerCase();
  const { organization_settings_by_pk: settings } = await deps.admin.request<{
    organization_settings_by_pk: { recognition_threshold: number } | null;
  }>(SETTINGS, { org: organizationId });
  const options: SearchOptions = resolveSearchOptions(run.input, settings?.recognition_threshold ?? null);
  const file = options.imageFileId ? await loadImageFile(deps.admin, organizationId, run.userId, options.imageFileId) : null;

  const requestId = await deps.actor
    .request<{ insert_search_requests_one: { id: string } }>(INSERT, {
      object: {
        organization_id: organizationId,
        user_id: run.userId,
        saved_search_id: run.savedSearchId ?? null,
        search_type: options.searchType,
        image_file_id: options.imageFileId,
        filters: options.filters,
        threshold: options.threshold,
        max_results: options.maxResults,
        fuzzy: options.fuzzy,
        status: 'queued',
      },
    })
    .then((data) => data.insert_search_requests_one.id)
    .catch((error: unknown) => {
      throw insertError(error);
    });

  const elapsed = () => Date.now() - startedAt;
  let faceCount: number | null = null;
  try {
    await deps.actor.request(START, { id: requestId, at: new Date().toISOString() });
    let embedding: number[] | null = null;
    if (file) ({ embedding, faceCount } = await extractEmbedding(deps, file));

    const { search_identities: matches } = await deps.admin.request<{ search_identities: Match[] }>(SEARCH, {
      org: organizationId,
      embedding: embedding ? vectorLiteral(embedding) : null,
      threshold: options.threshold,
      limit: options.maxResults,
      filters: options.filters,
      fuzzy: options.fuzzy,
    });
    const topConfidence = matches[0]?.confidence ?? null;
    const durationMs = elapsed();
    await deps.actor.request(COMPLETE, {
      id: requestId,
      results: matches.map((m) => ({
        organization_id: organizationId,
        search_request_id: requestId,
        identity_id: m.identity_id,
        profile_id: m.profile_id,
        rank: m.rank,
        confidence: m.confidence,
        match_type: m.match_type,
      })),
      set: {
        status: 'completed',
        results_count: matches.length,
        top_confidence: topConfidence,
        face_count: faceCount,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      },
    });
    return { searchRequestId: requestId, status: 'completed', resultsCount: matches.length, topConfidence, durationMs, faceCount, error: null };
  } catch (error: unknown) {
    const failure = error instanceof SearchFailure ? error : null;
    const code = failure ? failure.message : `error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
    if (failure) faceCount = failure.faceCount;
    const durationMs = elapsed();
    const marked = deps.actor
      .request(FAIL, { id: requestId, error: code, faceCount, durationMs, at: new Date().toISOString() })
      .then(() => true);
    if (!failure) {
      await marked.catch(() => false);
      throw error;
    }
    await marked;
    return { searchRequestId: requestId, status: 'failed', resultsCount: 0, topConfidence: null, durationMs, faceCount, error: code };
  }
}
