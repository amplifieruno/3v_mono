import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  CONSENT_RECORD_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_RESOURCE,
} from '../../src/data/resource-names';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import { profilePairOutput } from '../../src/modules/people/profile-pair';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Documents, consent, restriction and merge against the dev stack (Nova, `org_admin`, a seeded
 * employee). The uploaded document is removed with `delete_file` (its row goes with the file),
 * the consent row is deleted and the restriction lifted again; the merge is only refused (a
 * profile into itself), since a merge cannot be undone.
 */

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'profile-records-dev-test',
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

describe.skipIf(!DEV_STACK_ENABLED)('profile documents, consent, restriction and merge against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let person: Row | undefined;
  let other: Row | undefined;
  const files: string[] = [];
  const consents: string[] = [];

  const custom = (kind: 'query' | 'mutation', operation: string, input: Row) => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: ref(operation), resource: PEOPLE_BINDING, operation, input };
    return kind === 'query'
      ? provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context())
      : provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context());
  };

  const list = async (resource: string, filter: Row) => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: offsetPage(1, 100),
        filter,
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  const one = async (resource: string, id: string) =>
    (
      (await provider.queries?.one?.(
        createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: ref(resource), resource, id } as never) as never,
        context(),
      )) as { data: Row }
    ).data;

  /** A raw `org_admin` GraphQL call, for the actions the console reaches through a field. */
  const graphql = async (query: string, variables: Row): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as Row;
  };

  const restrict = (restricted: boolean, reason: string) =>
    custom('mutation', 'setProcessingRestriction', { profileId: String(person?.id), restricted, reason });

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const employees = await list(PROFILE_RESOURCE, {
      and: [
        { field: 'profile_type', op: 'eq', value: 'employee' },
        { field: 'processing_restricted', op: 'eq', value: false },
        { field: 'erased_at', op: 'isNull' },
      ],
    });
    [person, other] = employees;
  });

  afterAll(async () => {
    for (const file of files) {
      await graphql('mutation ($f: uuid!) { delete_file(file_id: $f) { file_id } }', { f: file });
    }
    for (const id of consents) {
      await provider.mutations?.deleteOne?.(
        createMutationDescriptor({
          ...IDENTITY,
          kind: 'deleteOne',
          ref: ref(CONSENT_RECORD_RESOURCE),
          resource: CONSENT_RECORD_RESOURCE,
          idField: 'id',
          id,
        } as never) as never,
        context(),
      );
    }
    if (person !== undefined) await Promise.resolve(restrict(false, 'dev-test cleanup')).catch(() => undefined);
  });

  it('should store a document through the action and open it through open_file each time', async () => {
    expect(person, 'a seeded employee').toBeDefined();
    const uploaded = (await custom('mutation', 'uploadProfileDocument', {
      profileId: String(person?.id),
      kind: 'other',
      title: 'dev-test document',
      fileName: 'dev-test.png',
      mimeType: 'image/png',
      contentBase64: PNG_1X1,
    })) as { document_id: string; file_id: string };
    files.push(uploaded.file_id);
    const documents = await list(PROFILE_DOCUMENT_RESOURCE, { field: 'profile_id', op: 'eq', value: person?.id });
    expect(documents.find((d) => d.id === uploaded.document_id)).toMatchObject({
      title: 'dev-test document',
      kind: 'other',
      file_id: uploaded.file_id,
      version: 1,
    });
    const open = 'mutation ($f: uuid!) { open_file(file_id: $f) { url expires_at } }';
    const first = (await graphql(open, { f: uploaded.file_id })) as { data?: { open_file?: { url?: string } } };
    const second = (await graphql(open, { f: uploaded.file_id })) as { data?: { open_file?: { url?: string } } };
    expect(first.data?.open_file?.url).toMatch(/^https?:\/\//);
    expect(second.data?.open_file?.url).toMatch(/^https?:\/\//);
  });

  it('should refuse a document of another type', async () => {
    await expect(
      custom('mutation', 'uploadProfileDocument', {
        profileId: String(person?.id),
        kind: 'other',
        title: 'dev-test svg',
        fileName: 'x.svg',
        mimeType: 'image/svg+xml',
        contentBase64: btoa('<svg/>'),
      }),
    ).rejects.toBeDefined();
  });

  it('should record a consent and withdraw it, stamping the withdrawal', async () => {
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'createOne',
        ref: ref(CONSENT_RECORD_RESOURCE),
        resource: CONSENT_RECORD_RESOURCE,
        idField: 'id',
        input: { profile_id: person?.id, purpose: 'marketing', method: 'verbal', notes: 'dev-test' },
      } as never) as never,
      context(),
    )) as { record: Row };
    const id = String(created.record.id);
    consents.push(id);
    expect(created.record).toMatchObject({ status: 'granted', withdrawn_at: null });
    await provider.mutations?.updateOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'updateOne',
        ref: ref(CONSENT_RECORD_RESOURCE),
        resource: CONSENT_RECORD_RESOURCE,
        idField: 'id',
        id,
        input: { status: 'withdrawn' },
      } as never) as never,
      context(),
    );
    const row = await one(CONSENT_RECORD_RESOURCE, id);
    expect(row.status).toBe('withdrawn');
    expect(typeof row.withdrawn_at).toBe('string');
  });

  it('should restrict and lift processing with a reason, and refuse it without one', async () => {
    await expect(restrict(true, ' ')).rejects.toBeDefined();
    expect(await restrict(true, 'dev-test restriction')).toMatchObject({ processing_restricted: true });
    expect(await one(PROFILE_RESOURCE, String(person?.id))).toMatchObject({
      processing_restricted: true,
      restriction_reason: 'dev-test restriction',
    });
    expect(await restrict(false, 'dev-test lifted')).toMatchObject({ processing_restricted: false });
  });

  it('should compare two profiles and refuse merging a profile into itself', async () => {
    const pair = profilePairOutput.parse(
      await custom('query', 'profilePair', { first: String(person?.id), second: String(other?.id) }),
    );
    expect(pair.first?.id).toBe(person?.id);
    expect(pair.second?.id).toBe(other?.id);
    await expect(
      custom('mutation', 'mergeProfiles', { targetId: String(person?.id), sourceId: String(person?.id) }),
    ).rejects.toBeDefined();
  });
});
