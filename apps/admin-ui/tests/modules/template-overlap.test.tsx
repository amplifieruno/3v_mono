// @vitest-environment jsdom
import { implementBlock } from '@burojs/react';
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { templateOverlapBlock } from '../../src/modules/places/template-overlap-block';
import { TemplateOverlapView } from '../../src/modules/places/template-overlap-view';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The preview in the "Apply template" form (`itap:template-overlap`): the chosen template's
 * areas as a tree with their count, and a warning naming the top-level areas that already
 * exist under the chosen parent, since applying creates them again (Review Focus 5).
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const FACILITY = '55555555-5555-4555-8555-555555555555';
const TEMPLATE = '77777777-7777-4777-8777-777777777777';
const FLOOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

const TEMPLATE_ROW = {
  id: TEMPLATE,
  name: 'Standard office floor',
  description: null,
  structure: [
    { name: 'Elevator Lobby', area_type: 'corridor', capacity: 30 },
    {
      name: 'Open Office',
      area_type: 'zone',
      access_level: 'restricted',
      children: [{ name: 'Focus Booths', area_type: 'room', capacity: 8 }],
    },
  ],
};

const AREAS = [
  { id: FLOOR, facility_id: FACILITY, parent_id: null, name: 'Floor 2', area_type: 'floor' },
  { id: 'a1', facility_id: FACILITY, parent_id: FLOOR, name: 'Open office', area_type: 'zone' },
  { id: 'a2', facility_id: FACILITY, parent_id: null, name: 'Elevator Lobby', area_type: 'corridor' },
];

const view = implementBlock(templateOverlapBlock, { component: TemplateOverlapView });

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}

const render = (props: Record<string, unknown>) =>
  renderBlock(view, {
    props: { facilityId: FACILITY, ...props },
    wrapper: Wrapper,
    messages: {
      label: 'Template preview',
      pick: 'Choose a template to see the areas it creates.',
      creates: 'Creates {{count}} areas:',
      overlap:
        'Already here: {{names}}. Applying adds a second area with each of these names; existing areas are not skipped or merged.',
      loading: 'Reading the template…',
    },
  });

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      if (query.includes('facility_templates_by_pk')) return hasuraResponse({ data: { item: TEMPLATE_ROW } });
      if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 3 } } } });
      if (/\bitems: areas\(/.test(query)) return hasuraResponse({ data: { items: AREAS } });
      return hasuraResponse({ data: { items: [] } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('template overlap block', () => {
  it('should ask for a template first', async () => {
    await render({ templateId: null, parentId: null });
    expect(await screen.findByText('Choose a template to see the areas it creates.')).toBeDefined();
  });

  it('should preview the areas and warn about a name already inside the chosen area', async () => {
    await render({ templateId: TEMPLATE, parentId: FLOOR });
    expect(await screen.findByText('Creates 3 areas:')).toBeDefined();
    const tree = screen.getByRole('list', { name: 'Template preview' });
    const rows = within(tree).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-level'))).toEqual(['0', '0', '1']);
    expect(within(rows[2] as HTMLElement).getByText('Focus Booths')).toBeDefined();
    expect(within(rows[2] as HTMLElement).getByText('capacity 8')).toBeDefined();
    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toBe(
      'Already here: Open Office. Applying adds a second area with each of these names; existing areas are not skipped or merged.',
    );
  });

  it('should compare with the top level when no area is chosen', async () => {
    await render({ templateId: TEMPLATE, parentId: null });
    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toContain('Already here: Elevator Lobby.');
  });
});
