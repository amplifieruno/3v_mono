// @vitest-environment jsdom
import type { ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { bulkSearchCsv, parseBulkSearchCsv } from '../../src/fields/bulk-search-csv';
import { BulkSearchPhotosInput } from '../../src/fields/bulk-search-photos-input';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The bulk search photo picker keeps every photo chosen so far: mounted again with a CSV already
 * chosen (a step back in the dialog), it reads the photos back from that CSV before more can be
 * added, so the next CSV still lists the earlier ones.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const CSV = '77777777-7777-4777-8777-000000000009';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const P3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const NEXT_CSV = '77777777-7777-4777-8777-00000000000a';

const context = {
  meta: {},
  presentation: 'default',
  accessibility: { input: 'photos' },
  testIds: { root: 'photos-root', input: 'photos-input', error: 'photos-error' },
  multiple: false,
  issues: [],
  i18n: { locale: 'en' },
} as const;

const renderInRuntime = (node: React.ReactNode) =>
  render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      {node}
    </AppRuntime>,
  );

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('bulk search CSV', () => {
  it('should read back the photos it wrote, quoted labels included', () => {
    const photos = [
      { id: P1, name: 'lobby, 9am.jpg' },
      { id: P2, name: 'say "hi".png' },
    ];
    expect(parseBulkSearchCsv(bulkSearchCsv(photos))).toEqual(photos);
    expect(parseBulkSearchCsv('image_file_id,label\n')).toEqual([]);
  });
});

describe('bulk search photo picker', () => {
  it('should keep the photos of a CSV chosen before it was mounted when more are added', async () => {
    const posts: FormData[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/v1/files/${CSV}/presignedurl`)) return new Response(JSON.stringify({ url: 'https://files.test/csv', expiration: 60 }));
      if (url === 'https://files.test/csv') return new Response(bulkSearchCsv([{ id: P1, name: 'a.jpg' }, { id: P2, name: 'b.jpg' }]));
      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        posts.push(init.body as FormData);
        return new Response(JSON.stringify({ processedFiles: [{ id: posts.length === 1 ? P3 : NEXT_CSV }] }), { status: 201 });
      }
      return hasuraResponse({ data: {} });
    });
    const onChange = vi.fn();
    renderInRuntime(<BulkSearchPhotosInput {...({ ...context, value: CSV, onChange } as unknown as ScalarInputProps<unknown>)} />);
    expect(await screen.findByText('2 photos ready; one search runs per photo.')).toBeDefined();
    const input = screen.getByTestId('photos-input') as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { files: [new File(['c'], 'c.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(NEXT_CSV));
    const csv = posts[1]?.get('file[]') as File;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(csv);
    });
    expect(parseBulkSearchCsv(text).map((photo) => photo.id)).toEqual([P1, P2, P3]);
  });
});
