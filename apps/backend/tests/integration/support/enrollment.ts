import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { testEnv } from './clients.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/faces');

/** Face fixtures (see tests/fixtures/faces/README.md). person-a-1/2 are two photos of the same person. */
export const FACES = {
  personA1: { file: 'person-a-1.jpg', mimeType: 'image/jpeg' },
  personA2: { file: 'person-a-2.png', mimeType: 'image/png' },
  personB: { file: 'person-b.jpg', mimeType: 'image/jpeg' },
  group: { file: 'group.jpg', mimeType: 'image/jpeg' },
  noFace: { file: 'no-face.jpg', mimeType: 'image/jpeg' },
} as const;

export type FaceFixture = (typeof FACES)[keyof typeof FACES];

export function readFace(face: FaceFixture): Buffer {
  return readFileSync(resolve(FIXTURES, face.file));
}

/** Uploads a fixture into an organization bucket (removed with the organization by the fixture registry). */
export async function uploadFace(organizationId: string, face: FaceFixture): Promise<string> {
  const { id } = await createStorageClient(testEnv()).upload({
    bucketId: organizationId,
    name: face.file,
    mimeType: face.mimeType,
    data: readFace(face),
  });
  return id;
}

export type EnrollmentResult = {
  identity_id: string;
  identity_code: string;
  photos_added: number;
  templates: number;
  rejected: { file_id: string; reason: string }[];
};

const RESULT_FIELDS = 'identity_id identity_code photos_added templates rejected { file_id reason }';

export async function enrollFace(client: HasuraClient, profileId: string, fileIds: string[]): Promise<EnrollmentResult> {
  const data = await client.request<{ enroll_face: EnrollmentResult }>(
    `mutation($p: uuid!, $f: [uuid!]!) { enroll_face(profile_id: $p, file_ids: $f) { ${RESULT_FIELDS} } }`,
    { p: profileId, f: fileIds },
  );
  return data.enroll_face;
}

export async function createIdentityFromPhotos(
  client: HasuraClient,
  fileIds: string[],
  attributes?: Record<string, unknown>,
): Promise<EnrollmentResult> {
  const data = await client.request<{ create_identity_from_photos: EnrollmentResult }>(
    `mutation($f: [uuid!]!, $a: jsonb) { create_identity_from_photos(file_ids: $f, attributes: $a) { ${RESULT_FIELDS} } }`,
    { f: fileIds, a: attributes ?? null },
  );
  return data.create_identity_from_photos;
}

export async function addIdentityPhotos(client: HasuraClient, identityId: string, fileIds: string[]): Promise<EnrollmentResult> {
  const data = await client.request<{ add_identity_photos: EnrollmentResult }>(
    `mutation($i: uuid!, $f: [uuid!]!) { add_identity_photos(identity_id: $i, file_ids: $f) { ${RESULT_FIELDS} } }`,
    { i: identityId, f: fileIds },
  );
  return data.add_identity_photos;
}
