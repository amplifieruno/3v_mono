// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The custom attribute form: a select attribute cannot be saved without options and
 * saves the options it has; a text attribute shows no options; the key is not
 * editable. The preferences page: a create of the user's own row when there is none,
 * the edit of it when there is.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SHIFT = '33333333-3333-4333-8333-333333333333';
const BADGE = '44444444-4444-4444-8444-444444444444';

const BASE = {
  entity: 'profile',
  required: false,
  validation: null,
  visible_when: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};
const SHIFT_ROW = {
  ...BASE,
  id: SHIFT,
  key: 'shift',
  label: 'Shift',
  data_type: 'enum',
  options: ['day', 'night'],
  sort_order: 40,
};
const BADGE_ROW = {
  ...BASE,
  id: BADGE,
  key: 'badge_number',
  label: 'Badge number',
  data_type: 'string',
  options: null,
  sort_order: 10,
};

const SETTINGS_ROW = {
  user_id: 'user-1',
  locale: 'ru',
  timezone: 'Europe/Moscow',
  last_organization_id: NOVA,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const mutations = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

/** Answers by-pk reads of the two attributes and the user's settings rows (`settings`). */
function fakeGraphql(settings: readonly unknown[]) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
    if (query.trimStart().startsWith('mutation')) {
      return hasuraResponse({ data: { item: { ...SETTINGS_ROW, ...SHIFT_ROW } } });
    }
    const data = query.includes('custom_attribute_definitions_by_pk')
      ? { item: variables?.id === SHIFT ? SHIFT_ROW : BADGE_ROW }
      : query.includes('user_settings_by_pk')
        ? { item: SETTINGS_ROW }
        : query.includes('_aggregate')
          ? {
              meta: { aggregate: { count: query.includes('user_settings') ? settings.length : 0 } },
            }
          : { items: query.includes('user_settings(') ? settings : [] };
    return hasuraResponse({ data });
  };
}

function open(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );
}

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql([])));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('custom attribute form', () => {
  it('should refuse a select attribute without options before any request and save its options', async () => {
    open(`/custom-attributes/${SHIFT}/edit`);
    const first = await screen.findByRole('textbox', { name: 'Option 1' });
    expect((first as HTMLInputElement).value).toBe('day');
    expect(screen.queryByRole('textbox', { name: /^Key/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
    expect(screen.queryByRole('textbox', { name: 'Option 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('This field is required')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Option 1' }), {
      target: { value: 'morning' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Option 2' }), {
      target: { value: 'morning' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Option 2 repeats option 1.')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Option 2' }), {
      target: { value: 'evening' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('["morning","evening"]');
    expect(sent).not.toContain('"key"');
  });

  it('should show no options for a text attribute', async () => {
    open(`/custom-attributes/${BADGE}/edit`);
    expect(await screen.findByRole('textbox', { name: /^Label/ })).toBeDefined();
    expect(screen.queryByText('Options')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
  });
});

describe('preferences page', () => {
  it('should create the own row when there is none', async () => {
    open('/preferences');
    const language = await screen.findByRole('textbox', { name: /^Language/ });
    fireEvent.change(language, { target: { value: 'de-AT' } });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('insert_user_settings_one');
    expect(JSON.stringify(mutations()[0]?.variables)).toContain('"locale":"de-AT"');
    expect(JSON.stringify(mutations()[0]?.variables)).not.toContain('user_id');
  });

  it('should edit the own row when it exists and refuse a malformed language', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeGraphql([SETTINGS_ROW])));
    open('/preferences');
    const language = await screen.findByRole('textbox', { name: /^Language/ });
    await waitFor(() => expect((language as HTMLInputElement).value).toBe('ru'));
    fireEvent.change(language, { target: { value: 'Russian' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Enter a language code such as en, ru or de-AT.')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(language, { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('update_user_settings_by_pk');
  });
});
