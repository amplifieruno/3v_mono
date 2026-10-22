import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { IDENTITY_TIMELINE_BINDING, placeIdsOf, timelineEntry } from '../../src/blocks/identity-timeline/identity-timeline-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { mergeRow } from '../../src/modules/people/identity-merge-ops';
import { mergePreviewOutput } from '../../src/modules/people/identity-merge-preview';
import { mergeRollback } from '../../src/modules/people/merge-rollback-preview';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Identity governance against the dev stack (Nova, `org_admin`): merging two identities moves
 * the source's photos and templates to the target and freezes it, and rolling the merge back
 * restores both identities' photos, templates, status and profile link exactly (Review Focus 2);
 * the functions' refusals arrive as definite form issues; a relationship is stored once whatever
 * side adds it; the timeline reads with its place names. Cleanup: the merge is rolled back (its
 * row stays, as `rolled_back`, with its audit entries: merges are never deleted), the relationship
 * and the verification request are deleted.
 */

const SESSION = {
  providerId: 'hasura',
  sessionKey: 'identity-governance-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

type Row = Record<string, unknown>;

interface Pick {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly profile_id: string | null;
  readonly is_primary_for_profile: boolean;
}

/** An identity's photos and templates by id, its status and profile link: what a rollback restores. */
interface Snapshot {
  readonly status: string;
  readonly profile_id: string | null;
  readonly is_primary_for_profile: boolean;
  readonly photos: string[];
  readonly templates: string[];
}

describe.skipIf(!DEV_STACK_ENABLED)('identity governance against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let kept: Pick | undefined;
  let other: Pick | undefined;
  const cleanups: (() => Promise<unknown>)[] = [];

  const custom = (kind: 'mutation' | 'query', resource: string, operation: string, input: Row) => {
    const descriptor = { ...SESSION, kind: 'custom', ref: { namespace: 'default', id: operation }, resource, operation, input };
    return kind === 'mutation'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context());
  };
  const mutate = (operation: string, input: Row) => custom('mutation', PEOPLE_BINDING, operation, input);

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

  const snapshot = async (id: string): Promise<Snapshot> => {
    const data = await graphql(
      `query ($id: uuid!) {
        identities_by_pk(id: $id) {
          status profile_id is_primary_for_profile
          identity_photos(order_by: { id: asc }) { id }
          identity_embeddings(order_by: { id: asc }) { id }
        }
      }`,
      { id },
    );
    const row = data.identities_by_pk as Row & { identity_photos: { id: string }[]; identity_embeddings: { id: string }[] };
    return {
      status: String(row.status),
      profile_id: (row.profile_id as string | null) ?? null,
      is_primary_for_profile: row.is_primary_for_profile === true,
      photos: row.identity_photos.map((p) => p.id),
      templates: row.identity_embeddings.map((e) => e.id),
    };
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    // Two unknown, unverified identities with photos and nothing a rollback cannot restore
    // (a pending verification request a merge would cancel).
    const data = await graphql(`{
      identities(
        where: {
          status: { _eq: unverified }, profile_id: { _is_null: true }, is_synthetic: { _eq: false },
          matching_enabled: { _eq: true }, identity_photos: {},
          _not: { verification_requests: { status: { _eq: pending } } }
        }
        order_by: { number: asc }
        limit: 2
      ) { id code status profile_id is_primary_for_profile }
    }`);
    [kept, other] = data.identities as Pick[];
  }, 60_000);

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  }, 60_000);

  it('should merge, then roll back to exactly the photos, templates and links both had (Review Focus 2)', async () => {
    expect(kept, 'two seeded identities to merge').toBeDefined();
    expect(other).toBeDefined();
    const keptId = String(kept?.id);
    const otherId = String(other?.id);
    const before = { kept: await snapshot(keptId), other: await snapshot(otherId) };

    const preview = mergePreviewOutput.parse(await custom('query', PEOPLE_BINDING, 'identityMergePreview', { ids: [keptId, otherId] }));
    expect(preview.find((row) => row.id === otherId)?.photos).toBe(before.other.photos.length);

    const merge = mergeRow.parse(
      await mutate('mergeIdentities', { targetId: keptId, sourceIds: [otherId, keptId], reason: 'dev test' }),
    );
    let rolledBack = false;
    cleanups.push(async () => (rolledBack ? undefined : mutate('rollbackMerge', { mergeId: merge.id })));
    expect(merge).toMatchObject({ target_identity_id: keptId, status: 'completed' });

    const merged = { kept: await snapshot(keptId), other: await snapshot(otherId) };
    expect(merged.other).toMatchObject({ status: 'merged', photos: [], templates: [] });
    expect(merged.kept.photos.sort()).toEqual([...before.kept.photos, ...before.other.photos].sort());
    expect(merged.kept.templates.sort()).toEqual([...before.kept.templates, ...before.other.templates].sort());

    // The rollback review reads the merge with the identity that comes back.
    const review = mergeRollback
      .nullable()
      .parse(await custom('query', PEOPLE_BINDING, 'mergeRollbackPreview', { mergeId: merge.id }));
    expect(review?.sources).toEqual([
      expect.objectContaining({ previous_status: before.other.status, identity: expect.objectContaining({ id: otherId, status: 'merged' }) }),
    ]);

    // A second merge of the merged identity is refused before anything changes, on the form.
    await expect(mutate('mergeIdentities', { targetId: keptId, sourceIds: [otherId] })).rejects.toMatchObject({
      kind: 'validation',
      code: 'identity_already_merged',
    });

    const back = mergeRow.parse(await mutate('rollbackMerge', { mergeId: merge.id }));
    rolledBack = true;
    expect(back.status).toBe('rolled_back');
    const after = { kept: await snapshot(keptId), other: await snapshot(otherId) };
    expect(after).toEqual(before);

    await expect(mutate('rollbackMerge', { mergeId: merge.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'merge_not_completed',
    });
  }, 120_000);

  it('should refuse a split without photos and a decision on a missing request as definite refusals', async () => {
    await expect(
      mutate('splitIdentity', { identityId: String(kept?.id), photoIds: [], embeddingIds: [] }),
    ).rejects.toMatchObject({ kind: 'validation', code: 'split_rows_required' });
    await expect(mutate('approveVerification', { requestId: crypto.randomUUID(), reason: null })).rejects.toMatchObject({
      kind: 'validation',
      code: 'verification_not_found',
    });
  }, 60_000);

  it('should mark an unverified identity pending while its request is open, and back when it is withdrawn', async () => {
    const keptId = String(kept?.id);
    const created = await graphql(
      'mutation ($i: uuid!) { insert_verification_requests_one(object: { identity_id: $i, reason: "dev test" }) { id } }',
      { i: keptId },
    );
    const id = String((created.insert_verification_requests_one as Row).id);
    cleanups.push(() => graphql('mutation ($id: uuid!) { delete_verification_requests_by_pk(id: $id) { id } }', { id }));
    expect((await snapshot(keptId)).status).toBe('pending_verification');
    await graphql('mutation ($id: uuid!) { delete_verification_requests_by_pk(id: $id) { id } }', { id });
    expect((await snapshot(keptId)).status).toBe('unverified');
  }, 60_000);

  it('should store a relationship once whichever identity adds it', async () => {
    const keptId = String(kept?.id);
    const otherId = String(other?.id);
    // Added from the identity with the larger id: the stored pair is still ordered.
    const [first, second] = keptId > otherId ? [keptId, otherId] : [otherId, keptId];
    const added = (await mutate('addIdentityRelationship', {
      identityId: first,
      otherId: second,
      relation: 'companion',
      confidence: 0.7,
      note: 'dev test',
    })) as { id: string };
    cleanups.push(() =>
      graphql('mutation ($id: uuid!) { delete_identity_relationships_by_pk(id: $id) { id } }', { id: added.id }),
    );
    const rows = (await custom('query', PEOPLE_BINDING, 'identityRelationships', { identityId: first })) as {
      id: string;
      identity_a: { id: string };
    }[];
    expect(rows.find((row) => row.id === added.id)?.identity_a.id).toBe(second);
    await expect(
      mutate('addIdentityRelationship', { identityId: second, otherId: first, relation: 'related' }),
    ).rejects.toMatchObject({ kind: 'validation', code: 'identity_relationships_pair_key' });
  }, 60_000);

  it('should read an identity’s timeline with the names of its places', async () => {
    const data = await graphql(`{ identity_locations(limit: 1, order_by: { occurred_at: desc }) { identity_id } }`);
    const identityId = String((data.identity_locations as Row[])[0]?.identity_id);
    const entries = timelineEntry
      .array()
      .parse(await custom('query', IDENTITY_TIMELINE_BINDING, 'identityTimeline', { identityId, limit: 20 }));
    expect(entries.length).toBeGreaterThan(0);
    const names = (await custom('query', IDENTITY_TIMELINE_BINDING, 'placeNames', placeIdsOf(entries))) as Record<string, string>;
    const facility = entries.find((entry) => entry.facility_id !== null)?.facility_id ?? undefined;
    expect(facility === undefined ? undefined : names[facility]).toEqual(expect.any(String));
  }, 60_000);
});
