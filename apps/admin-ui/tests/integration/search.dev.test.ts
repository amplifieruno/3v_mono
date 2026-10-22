import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { SEARCH_RESULTS_BINDING, type SearchRun, searchRun } from '../../src/blocks/search-results/search-results-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { SEARCH_REQUEST_RESOURCE } from '../../src/data/resource-names';
import { mergeRow } from '../../src/modules/people/identity-merge-ops';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import type { SearchDefinition } from '../../src/modules/search/search-definition';
import { SEARCH_BINDING, type SearchOutcome, searchOutcome } from '../../src/modules/search/search-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Face and attribute search against the dev stack (Nova, `org_admin`), through the console's own
 * operations: a seeded identity's photo finds that identity first; the photo of a person whose
 * processing is restricted never returns them, and no result is a person excluded from matching
 * (Review Focus 2); after a merge the source's photo finds the merge target, never the merged
 * identity (Review Focus 2); a photo without a face is a failed request with `no_face` (Review
 * Focus 1); a filter naming an unknown company is refused before anything is written. Cleanup: the
 * merge is rolled back; the test's own search requests are deleted with the admin secret (history
 * is never deleted by `org_admin`).
 */

const SESSION = { providerId: 'hasura', sessionKey: 'search-dev-test', scopeKey: null, bindingRevision: '1' } as const;

type Row = Record<string, unknown>;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const definition = (overrides: Partial<SearchDefinition>): SearchDefinition => ({
  search_type: 'facial',
  image_file_id: null,
  filters: {},
  threshold: 0.3,
  max_results: 100,
  fuzzy: false,
  ...overrides,
});

describe.skipIf(!DEV_STACK_ENABLED)('face and attribute search against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const requests: string[] = [];
  const cleanups: (() => Promise<unknown>)[] = [];

  const custom = (kind: 'mutation' | 'query', resource: string, operation: string, input: Row) => {
    const descriptor = { ...SESSION, kind: 'custom', ref: { namespace: 'default', id: operation }, resource, operation, input };
    return kind === 'mutation'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context());
  };

  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  /** Runs a search as the console does and reads it back as the results block does. */
  const search = async (input: SearchDefinition): Promise<{ outcome: SearchOutcome; run: SearchRun }> => {
    const outcome = searchOutcome.parse(await custom('mutation', SEARCH_BINDING, 'searchFaces', input));
    requests.push(outcome.search_request_id);
    const run = searchRun.parse(await custom('query', SEARCH_RESULTS_BINDING, 'searchRun', { requestId: outcome.search_request_id }));
    return { outcome, run };
  };

  const foundIds = (run: SearchRun): string[] => run.results.map((match) => match.identity?.id ?? '');

  const photoOf = async (identityId: string): Promise<string> => {
    const data = await graphql(
      'query ($id: uuid!) { identity_photos(where: { identity_id: { _eq: $id } }, order_by: { quality_score: desc_nulls_last }, limit: 1) { file_id } }',
      { id: identityId },
    );
    const file = (data.identity_photos as { file_id: string }[])[0]?.file_id;
    expect(file, `a photo of identity ${identityId}`).toBeDefined();
    return String(file);
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  }, 60_000);

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
    if (requests.length === 0) return;
    const ids = requests.map((id) => `'${id}'`).join(', ');
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: `delete from itap.search_requests where id in (${ids})` } }),
    });
    expect(response.ok).toBe(true);
  }, 60_000);

  it('should find a seeded identity by its own photo, first and exact, and list it in the history', async () => {
    const data = await graphql(`{
      identities(
        where: { status: { _eq: verified }, matching_enabled: { _eq: true }, is_synthetic: { _eq: false }, identity_photos: {} }
        order_by: { number: asc }
        limit: 1
      ) { id code }
    }`);
    const identity = (data.identities as { id: string; code: string }[])[0];
    expect(identity, 'a verified identity with photos').toBeDefined();
    const { outcome, run } = await search(definition({ image_file_id: await photoOf(String(identity?.id)), threshold: 0.5 }));
    expect(outcome).toMatchObject({ status: 'completed', error: null, face_count: 1 });
    expect(run.results[0]).toMatchObject({ rank: 1, match_type: 'exact', identity: { id: identity?.id, code: identity?.code } });
    expect(run.results.every((match) => (match.confidence ?? 0) >= 0.5)).toBe(true);

    // The history is the member's own: the request is there, with the user's own rows only.
    const listed = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...SESSION,
        kind: 'list',
        ref: { namespace: 'default', id: SEARCH_REQUEST_RESOURCE },
        resource: SEARCH_REQUEST_RESOURCE,
        sort: [{ field: 'created_at', direction: 'desc' }],
        pagination: offsetPage(1, 10),
      } as never) as never,
      context() as never,
    )) as { data: Row[] };
    expect(listed.data.map((row) => row.id)).toContain(outcome.search_request_id);
  }, 120_000);

  it('should never return a restricted person, nor anyone excluded from matching (Review Focus 2)', async () => {
    const data = await graphql(`{
      profiles(where: { processing_restricted: { _eq: true }, identities: { identity_photos: {} } }, limit: 1) {
        id identities(where: { identity_photos: {} }, limit: 1) { id }
      }
    }`);
    const restricted = (data.profiles as { id: string; identities: { id: string }[] }[])[0]?.identities[0]?.id;
    expect(restricted, 'the seed restricts a profile with an enrolled face').toBeDefined();
    const { outcome, run } = await search(definition({ image_file_id: await photoOf(String(restricted)), threshold: 0.2, fuzzy: true }));
    expect(outcome.status).toBe('completed');
    expect(foundIds(run)).not.toContain(restricted);

    const found = foundIds(run);
    if (found.length > 0) {
      const checked = await graphql(
        `query ($ids: [uuid!]!) {
          identities(where: { id: { _in: $ids } }) { id matching_enabled status profile { processing_restricted } }
        }`,
        { ids: found },
      );
      for (const row of checked.identities as { matching_enabled: boolean; status: string; profile: { processing_restricted: boolean } | null }[]) {
        expect(row).toMatchObject({ matching_enabled: true });
        expect(row.status).not.toBe('merged');
        expect(row.profile?.processing_restricted ?? false).toBe(false);
      }
    }
  }, 120_000);

  it('should resolve a merged identity to its target (Review Focus 2)', async () => {
    const data = await graphql(`{
      identities(
        where: {
          status: { _eq: unverified }, profile_id: { _is_null: true }, is_synthetic: { _eq: false },
          matching_enabled: { _eq: true }, identity_photos: {},
          _not: { verification_requests: { status: { _eq: pending } } }
        }
        order_by: { number: desc }
        limit: 10
      ) { id }
    }`);
    const candidates = (data.identities as { id: string }[]).map((row) => row.id);
    // The source: an identity its own best photo finds first (the seed has look-alikes among the
    // unknown faces); the target: another candidate.
    let source: string | undefined;
    let photo = '';
    for (const candidate of candidates) {
      photo = await photoOf(candidate);
      const before = await search(definition({ image_file_id: photo, threshold: 0.5 }));
      if (before.run.results[0]?.identity?.id === candidate) {
        source = candidate;
        break;
      }
    }
    const target = candidates.find((candidate) => candidate !== source);
    expect(source, 'an unknown identity its own photo finds first').toBeDefined();
    expect(target).toBeDefined();

    const merge = mergeRow.parse(
      await custom('mutation', PEOPLE_BINDING, 'mergeIdentities', { targetId: target, sourceIds: [source], reason: 'search dev test' }),
    );
    let rolledBack = false;
    cleanups.push(async () => (rolledBack ? undefined : custom('mutation', PEOPLE_BINDING, 'rollbackMerge', { mergeId: merge.id })));
    try {
      const after = await search(definition({ image_file_id: photo, threshold: 0.5 }));
      expect(after.outcome.status).toBe('completed');
      expect(foundIds(after.run)).not.toContain(source);
      expect(after.run.results[0]).toMatchObject({ rank: 1, identity: { id: target } });

      // An attribute search lists the target, never the merged identity.
      const attribute = await search(definition({ search_type: 'attribute', threshold: null, filters: { linked: false, status: ['unverified', 'merged'] } }));
      expect(foundIds(attribute.run)).not.toContain(source);
    } finally {
      await custom('mutation', PEOPLE_BINDING, 'rollbackMerge', { mergeId: merge.id });
      rolledBack = true;
    }
  }, 180_000);

  it('should record a photo without a face as a failed search with no_face (Review Focus 1)', async () => {
    const data = await graphql('{ floor_plans(where: { image_file_id: { _is_null: false } }, limit: 1) { image_file_id } }');
    const plan = (data.floor_plans as { image_file_id: string }[])[0]?.image_file_id;
    expect(plan, 'a seeded floor plan image').toBeDefined();
    const { outcome, run } = await search(definition({ image_file_id: String(plan) }));
    expect(outcome).toMatchObject({ status: 'failed', error: 'no_face', results_count: 0 });
    expect(run).toMatchObject({ status: 'failed', error: 'no_face', results: [] });
  }, 120_000);

  it('should run an attribute search, and refuse a filter naming no company before writing', async () => {
    const { run } = await search(definition({ search_type: 'attribute', threshold: null, max_results: 5, filters: { linked: true } }));
    expect(run.status).toBe('completed');
    expect(run.results.length).toBeGreaterThan(0);
    expect(run.results.every((match) => match.match_type === 'exact' && match.confidence === null && match.profile !== null)).toBe(true);

    await expect(
      custom('mutation', SEARCH_BINDING, 'searchFaces', definition({ search_type: 'attribute', threshold: null, filters: { company_id: crypto.randomUUID() } })),
    ).rejects.toMatchObject({ kind: 'validation', code: 'invalid_filters' });
  }, 120_000);
});
