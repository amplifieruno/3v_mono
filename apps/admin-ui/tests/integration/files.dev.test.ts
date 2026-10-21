import { type DataProvider, type MutationContext, createMutationDescriptor, createQueryDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { type StorageTarget, presignStorageFile, uploadStorageFile } from '../../src/fields/storage-client';
import { ORGANIZATION_RESOURCE } from '../../src/modules/organization/organization';
import { DEV_GRAPHQL, DEV_STACK_ENABLED, signInDev } from '../support/dev-stack';

/**
 * The logo round trip against the dev stack (Nova Tower, `org_admin`): the
 * console's storage client uploads a PNG into `org-logos` with `kind: logo`,
 * the organization row takes the file id, and the presigned URL serves it.
 * The previous logo is restored at the end; the uploaded file stays in the
 * bucket (org_admin cannot delete `org-logos` files).
 */

const DEV_STORAGE = 'http://local.storage.local.nhost.run';

/** A 1x1 transparent PNG: hasura-storage detects the type from the bytes. */
const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'files-dev-test',
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

describe.skipIf(!DEV_STACK_ENABLED)('storage files against the dev stack (Nova Tower)', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let target: StorageTarget;
  let organizationId: string;
  let previousLogo: string | null = null;

  async function setLogo(logo: string | null): Promise<Record<string, unknown>> {
    const update = createMutationDescriptor({
      ...IDENTITY,
      kind: 'updateOne',
      ref: ref(ORGANIZATION_RESOURCE),
      resource: ORGANIZATION_RESOURCE,
      idField: 'id',
      id: organizationId,
      input: { logo_file_id: logo },
    } as never);
    const result = (await provider.mutations?.updateOne?.(update as never, context())) as {
      record: Record<string, unknown>;
    };
    return result.record;
  }

  beforeAll(async () => {
    auth = await signInDev('admin@itap.demo', 'Nova Tower Business Center');
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    target = { base: DEV_STORAGE, getToken: () => auth.getToken() };
    const identity = await auth.getIdentity({} as never);
    organizationId = identity?.organizationId ?? '';
    const read = createQueryDescriptor({
      ...IDENTITY,
      kind: 'one',
      ref: ref(ORGANIZATION_RESOURCE),
      resource: ORGANIZATION_RESOURCE,
      id: organizationId,
    } as never);
    const row = (await provider.queries?.one?.(read as never, context())) as { data: Record<string, unknown> };
    previousLogo = typeof row.data.logo_file_id === 'string' ? row.data.logo_file_id : null;
  });

  afterAll(async () => {
    if (organizationId) await setLogo(previousLogo);
  });

  it('should upload a logo, link it to the organization and serve it through a presigned URL', async () => {
    const file = new File([PNG_1X1], 'itap-test-logo.png', { type: 'image/png' });
    const { id } = await uploadStorageFile(file, { bucket: 'org-logos', kind: 'logo' }, target);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const record = await setLogo(id);
    expect(record.logo_file_id).toBe(id);

    const { url } = await presignStorageFile(id, target);
    const served = await fetch(url);
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG_1X1);
  });

  // Skipped: hasura-storage accepts it today (bd 3v_mono-ryj, data layer); each run would leave a
  // sensitive file org_admin cannot delete. Enable once the storage check is fixed.
  it.skip('should refuse a sensitive kind in the organization bucket', async () => {
    const file = new File(['secret'], 'passport.txt', { type: 'text/plain' });
    await expect(
      uploadStorageFile(file, { bucket: organizationId, kind: 'profile_document' }, target),
    ).rejects.toMatchObject({ name: 'StorageRequestError', status: 403 });
  });
});
