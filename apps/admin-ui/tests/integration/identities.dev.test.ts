import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { PHOTO_GALLERY_BINDING, galleryPhotos } from '../../src/blocks/photo-gallery/identity-photos-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { FACE_SOURCE_KIND } from '../../src/fields/face-photos';
import { type StorageTarget, presignStorageFile, uploadStorageFile } from '../../src/fields/storage-client';
import { enrollmentResult } from '../../src/modules/people/enrollment';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Enrollment against the dev stack (Nova, `org_admin`, real InsightFace): photos are uploaded as
 * the console uploads them (kind `face_source`), the actions' refusals arrive as form issues
 * through the provider (which photo, why; the identity a face already belongs to), and a partly
 * accepted request answers the refused photo. Cleanup: the uploaded files are deleted with
 * `delete_file`; the one photo the partial request adds to a seeded identity is removed again
 * (its embedding, its photo row, its crop file).
 */

const FACES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/tests/fixtures/faces');

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'identities-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const ref = (id: string) => ({ namespace: 'default', id });

type Row = Record<string, unknown>;

interface Seeded {
  readonly id: string;
  readonly code: string;
  readonly primary_photo_file_id: string;
}

describe.skipIf(!DEV_STACK_ENABLED)('identities and enrollment against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let target: StorageTarget;
  let organizationId = '';
  let seeded: Seeded | undefined;
  /** Seeded identities with a primary photo; the first is `seeded`. */
  let candidates: readonly Seeded[] = [];
  const uploaded: string[] = [];
  const startedAt = new Date().toISOString();

  const mutate = (operation: string, input: Row) =>
    provider.mutations?.custom?.(
      createMutationDescriptor({ ...IDENTITY, kind: 'custom', ref: ref(operation), resource: PEOPLE_BINDING, operation, input } as never) as never,
      context(),
    );

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

  const upload = async (name: string, bytes: Uint8Array<ArrayBuffer>, type: string): Promise<string> => {
    const { id } = await uploadStorageFile(new File([bytes], name, { type }), { bucket: organizationId, kind: FACE_SOURCE_KIND }, target);
    uploaded.push(id);
    return id;
  };
  const fixture = (file: string, type = 'image/jpeg') =>
    upload(`dev-test-${file}`, new Uint8Array(readFileSync(resolve(FACES, file))), type);

  /** A copy of a seeded identity's own primary crop, uploaded as a new face photo. */
  const seededFace = async (of: Seeded | undefined = seeded): Promise<string> => {
    const { url } = await presignStorageFile(String(of?.primary_photo_file_id), target);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return upload('dev-test-seeded-face.jpg', bytes, 'image/jpeg');
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    target = { base: DEV_STORAGE, getToken: () => auth.getToken() };
    organizationId = (await auth.getIdentity({} as never))?.organizationId ?? '';
    const data = await graphql(`{
      identities(
        where: {
          primary_photo_file_id: { _is_null: false }, matching_enabled: { _eq: true }, is_synthetic: { _eq: false },
          status: { _in: [unverified, verified] }, profile: { processing_restricted: { _eq: false } }
        }
        order_by: { number: asc }
        limit: 8
      ) { id code primary_photo_file_id }
    }`);
    candidates = data.identities as Seeded[];
    seeded = candidates[0];
  }, 60_000);

  afterAll(async () => {
    for (const file of uploaded) {
      await graphql('mutation ($f: uuid!) { delete_file(file_id: $f) { file_id } }', { f: file }).catch(() => undefined);
    }
  }, 60_000);

  it('should say photo by photo why nothing was saved when no photo shows one usable face', async () => {
    const noFace = await fixture('no-face.jpg');
    const group = await fixture('group.jpg');
    await expect(mutate('createIdentityFromPhotos', { fileIds: [noFace, group] })).rejects.toMatchObject({
      kind: 'validation',
      code: 'no_valid_photos',
      details: {
        issues: [
          {
            path: ['fileIds'],
            message: {
              default:
                'No photo shows a usable face, so nothing was saved. Photo 1: no face found. Photo 2: more than one face; use a photo of the person alone.',
            },
          },
        ],
      },
    });
  }, 60_000);

  it('should name the identity a face already belongs to and create nothing', async () => {
    expect(seeded, 'a seeded identity with a primary photo').toBeDefined();
    const face = await seededFace();
    const before = await graphql('{ identities_aggregate { aggregate { count } } }');
    const refusal: unknown = await Promise.resolve(mutate('createIdentityFromPhotos', { fileIds: [face] })).catch(
      (error: unknown) => error,
    );
    expect(refusal).toMatchObject({ kind: 'validation', code: 'duplicate_identity' });
    expect(JSON.stringify(refusal)).toMatch(/This face already belongs to IDENTITY-\d{5}\./);
    expect(await graphql('{ identities_aggregate { aggregate { count } } }')).toEqual(before);
  }, 60_000);

  it('should add the good photo and answer the refused one with its reason', async () => {
    // Live recognition runs on the dev stack create camera identities; one of them may hold the
    // same face as a seeded identity, and the action then refuses the copy as conflicting. Such a
    // refusal adds nothing: try the next seeded identity.
    let done = false;
    for (const candidate of candidates) {
      const identityId = candidate.id;
      const face = await seededFace(candidate);
      const noFace = await fixture('no-face.jpg');
      try {
        const result = enrollmentResult.parse(await mutate('addIdentityPhotos', { identityId, fileIds: [face, noFace] }));
        if (result.rejected.some((entry) => entry.file_id === face && entry.reason === 'conflicting_identity')) {
          expect(result.photos_added).toBe(0);
          continue;
        }
        expect(result).toMatchObject({
          identity_id: identityId,
          identity_code: candidate.code,
          photos_added: 1,
          rejected: [{ file_id: noFace, reason: 'no_face' }],
        });
        const gallery = galleryPhotos.parse(
          await provider.queries?.custom?.(
            createQueryDescriptor({
              ...IDENTITY,
              kind: 'custom',
              ref: ref('identityPhotos'),
              resource: PHOTO_GALLERY_BINDING,
              operation: 'identityPhotos',
              input: { identityId },
            } as never) as never,
            context(),
          ),
        );
        expect(gallery.photos.some((photo) => photo.kind === 'manual' && photo.created_at >= startedAt)).toBe(true);
        done = true;
        break;
      } finally {
        // Remove what the request added: the embedding, the photo row and the crop file.
        const added = await graphql(
          'query ($i: uuid!, $t: timestamptz!) { identity_photos(where: { identity_id: { _eq: $i }, created_at: { _gte: $t } }) { id file_id } }',
          { i: identityId, t: startedAt },
        );
        for (const photo of added.identity_photos as { id: string; file_id: string }[]) {
          await graphql('mutation ($f: uuid!) { delete_identity_embeddings(where: { photo_file_id: { _eq: $f } }) { affected_rows } }', { f: photo.file_id });
          await graphql('mutation ($id: uuid!) { delete_identity_photos_by_pk(id: $id) { id } }', { id: photo.id });
          uploaded.push(photo.file_id);
        }
      }
    }
    expect(done, 'a seeded identity whose own face no camera identity holds').toBe(true);
  }, 120_000);
});
