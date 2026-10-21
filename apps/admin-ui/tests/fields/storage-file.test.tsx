// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import type { ItapAuthProvider, ItapIdentity } from '../../src/auth';
import { StorageFileDisplay } from '../../src/fields/storage-file-display';
import { StorageFileInput } from '../../src/fields/storage-file-input';
import type { StorageFileMeta } from '../../src/fields/storage-file-meta';

/**
 * The `itap.storage-file` input and display inside the console runtime, with a
 * fake `fetch`: uploads go to hasura-storage as multipart with the bucket and
 * the `kind` metadata, a refused upload keeps the value, and a sensitive file
 * is opened through the `open_file` action, never presigned.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const OLD_FILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_FILE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const LOGO: StorageFileMeta = {
  bucket: 'org-logos',
  kind: 'logo',
  sensitive: false,
  accept: 'image/png,image/jpeg,image/webp',
  maxSize: 2 * 1024 * 1024,
};
const DOCUMENT: StorageFileMeta = { bucket: 'organization', kind: 'profile_document', sensitive: true, accept: null, maxSize: null };

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeAuth(): ItapAuthProvider {
  const identity: ItapIdentity = {
    id: 'user-1',
    email: 'admin@itap.demo',
    name: 'Admin',
    roles: ['org_admin'],
    organizationId: ORG,
    memberships: [{ organizationId: ORG, name: 'Nova', logoFileId: null, role: 'admin', status: 'active' }],
  };
  return {
    check: async () => ({ authenticated: true }),
    getIdentity: async () => identity,
    login: async () => ({ success: true }),
    logout: async () => ({ success: true }),
    onError: async (error) => ({ action: 'propagate', error }),
    getToken: async () => 'fake-org-token',
    switchOrganization: async () => ({ success: true }),
  };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The render context of a field implementation; only what these components read. */
function context(meta: StorageFileMeta) {
  return {
    meta,
    presentation: 'default',
    accessibility: { input: 'logo' },
    testIds: { root: 'logo-root', input: 'logo-input', error: 'logo-error' },
    multiple: false,
  } as const;
}

function renderInRuntime(node: React.ReactNode) {
  return render(
    <AppRuntime auth={fakeAuth()} initialOrganizationId={ORG}>
      {node}
    </AppRuntime>,
  );
}

function renderInput(meta: StorageFileMeta, value: string | null, onChange: (value: unknown) => void) {
  const props = { ...context(meta), value, onChange } as unknown as ScalarInputProps<unknown, StorageFileMeta>;
  return renderInRuntime(<StorageFileInput {...props} />);
}

const png = (): File => new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

describe('storage file field', () => {
  it('should upload multipart with the bucket and the kind, then set the returned id', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/v1/files')
        ? json(201, { processedFiles: [{ id: NEW_FILE }] })
        : json(200, { url: 'http://storage.test/logo.png', expiration: 60 }),
    );
    const onChange = vi.fn();
    renderInput(LOGO, null, onChange);

    fireEvent.change(await screen.findByTestId('logo-input'), { target: { files: [png()] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(NEW_FILE));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/storage/v1/files');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-org-token');
    const body = init?.body as FormData;
    expect(body.get('bucket-id')).toBe('org-logos');
    expect(JSON.parse(String(body.get('metadata[]')))).toEqual({ name: 'logo.png', metadata: { kind: 'logo' } });
    expect((body.get('file[]') as File).name).toBe('logo.png');
  });

  it('should upload into the organization bucket for an organization file', async () => {
    fetchMock.mockResolvedValue(json(201, { processedFiles: [{ id: NEW_FILE }] }));
    const onChange = vi.fn();
    renderInput({ ...DOCUMENT, kind: 'integration_fixture', sensitive: false }, null, onChange);
    // The bucket is the organization id from the identity, read once it has loaded.
    const upload = await screen.findByRole('button', { name: /Upload/ });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));

    fireEvent.change(await screen.findByTestId('logo-input'), {
      target: { files: [new File(['a,b'], 'people.csv', { type: 'text/csv' })] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(NEW_FILE));
    expect((fetchMock.mock.calls[0]?.[1]?.body as FormData).get('bucket-id')).toBe(ORG);
  });

  it('should show a refusal under the field and keep the previous value', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/v1/files')
        ? json(403, { error: { message: 'you are not authorized' } })
        : json(200, { url: 'http://storage.test/old.png', expiration: 60 }),
    );
    const onChange = vi.fn();
    renderInput(LOGO, OLD_FILE, onChange);

    fireEvent.change(await screen.findByTestId('logo-input'), { target: { files: [png()] } });

    const error = await screen.findByText(/Storage refused the file \(403\)\. you are not authorized/);
    expect(error.getAttribute('data-testid')).toBe('logo-error');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Replace/ })).toBeDefined();
  });

  it('should refuse a file type the field does not accept before any request', async () => {
    const onChange = vi.fn();
    renderInput(LOGO, null, onChange);

    fireEvent.change(await screen.findByTestId('logo-input'), {
      target: { files: [new File(['x'], 'logo.gif', { type: 'image/gif' })] },
    });

    expect(await screen.findByText('This file type is not accepted here.')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should preview an image through the presigned URL', async () => {
    fetchMock.mockResolvedValue(json(200, { url: 'http://storage.test/old.png', expiration: 60 }));
    const props = { ...context(LOGO), value: OLD_FILE } as unknown as ScalarDisplayProps<unknown, StorageFileMeta>;
    renderInRuntime(<StorageFileDisplay {...props} />);

    const img = await screen.findByTestId('storage-file-preview');
    expect(img.getAttribute('src')).toBe('http://storage.test/old.png');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/storage/v1/files/${OLD_FILE}/presignedurl`);
  });

  it('should open a sensitive file through open_file, not the presign endpoint', async () => {
    fetchMock.mockResolvedValue(
      json(200, { data: { open_file: { url: 'http://storage.test/doc.pdf', expires_at: '2026-10-21T10:00:00Z' } } }),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const props = { ...context(DOCUMENT), value: OLD_FILE } as unknown as ScalarDisplayProps<unknown, StorageFileMeta>;
    renderInRuntime(<StorageFileDisplay {...props} />);

    fireEvent.click(await screen.findByRole('button', { name: /Open file/ }));

    await waitFor(() => expect(open).toHaveBeenCalledWith('http://storage.test/doc.pdf', '_blank', 'noopener,noreferrer'));
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('presignedurl'))).toBe(false);
    const graphql = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/v1/graphql'));
    const request = JSON.parse(String(graphql?.[1]?.body)) as { query: string; variables: unknown };
    expect(request.query).toContain('open_file(file_id: $file_id)');
    expect(request.variables).toEqual({ file_id: OLD_FILE });
  });
});
