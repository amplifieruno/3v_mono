// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { catalogAnswer } from '../support/segment-conditions-fixture';

/**
 * Segments and templates on screen: a manual segment's form shows no conditions, active window or
 * schedule and sends none (the database keeps `{}`), also after switching back from dynamic with
 * conditions built, a dynamic one requires conditions; a refused delete says the database's
 * reason and stays on the segment (Review Focus 5); a built-in template offers "Create segment",
 * which sends the template's target and conditions under the new name.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SEGMENT = '22222222-2222-4222-8222-000000000001';
const TEMPLATE = '33333333-3333-4333-8333-000000000001';
const NEW_SEGMENT = '22222222-2222-4222-8222-000000000002';

const stamps = { created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
const SEGMENT_ROW = {
  ...stamps,
  id: SEGMENT,
  code: 'SEGMENT-00003',
  name: 'Executive floor access',
  description: null,
  color: null,
  icon: null,
  kind: 'manual',
  target: 'profiles',
  conditions: {},
  status: 'active',
  active_from: null,
  active_until: null,
  schedule: null,
  member_count: 5,
  last_evaluated_at: null,
  last_evaluation_error: null,
  last_evaluation_failed_at: null,
  template_id: null,
};
const CONDITIONS = { field: 'visits_last_30d', operator: 'gte', value: 8 };
const TEMPLATE_ROW = {
  ...stamps,
  id: TEMPLATE,
  name: 'Frequent visitors',
  description: 'Seen often',
  target: 'profiles',
  category: 'behavior',
  conditions: CONDITIONS,
  is_system: true,
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

let deleteAnswer: unknown = { data: { delete_segments_by_pk: { id: SEGMENT } } };
let segmentRow: Record<string, unknown> = SEGMENT_ROW;

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('delete_segments_by_pk')) return hasuraResponse(deleteAnswer);
  if (query.includes('segment_fields(')) return hasuraResponse(catalogAnswer());
  if (query.includes('insert_segments_one')) {
    return hasuraResponse({ data: { insert_segments_one: { id: NEW_SEGMENT, code: 'SEGMENT-00020' } } });
  }
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: { ...SEGMENT_ROW, id: NEW_SEGMENT } } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('segments_by_pk')) return hasuraResponse({ data: { item: segmentRow } });
  if (query.includes('segment_templates_by_pk')) return hasuraResponse({ data: { item: TEMPLATE_ROW } });
  if (/\bitems: segments\(/.test(query)) return hasuraResponse({ data: { items: [SEGMENT_ROW] } });
  if (/\bitems: segment_templates\(/.test(query)) return hasuraResponse({ data: { items: [TEMPLATE_ROW] } });
  if (query.includes('segment_daily_stats(')) return hasuraResponse({ data: { segment_daily_stats: [] } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

async function chooseOption(name: RegExp, option: RegExp): Promise<void> {
  fireEvent.click(await screen.findByRole('combobox', { name }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  deleteAnswer = { data: { delete_segments_by_pk: { id: SEGMENT } } };
  segmentRow = SEGMENT_ROW;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('segment form', () => {
  it('should create a manual segment without conditions', async () => {
    renderAt('/segments/create');
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Night watch' } });
    // Conditions, active window and schedule bound rule members: a manual segment has none.
    expect(screen.queryByLabelText(/^Conditions/)).toBeNull();
    expect(screen.queryByLabelText(/^Active from/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('"kind":"manual"');
    expect(sent).toContain('Night watch');
    // segments_conditions_match_kind: the database keeps '{}' for a manual segment.
    expect(sent).not.toContain('conditions');
  });

  it('should ask a dynamic segment for its conditions', async () => {
    renderAt('/segments/create');
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Regulars' } });
    await chooseOption(/^Kind/, /^Dynamic/);
    expect(await screen.findByText('No conditions yet.')).toBeDefined();
    expect(screen.getByLabelText(/^Active from/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByText('A dynamic segment needs conditions: who belongs to it.')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should create a dynamic segment with the conditions built in the editor', async () => {
    renderAt('/segments/create');
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Regulars' } });
    await chooseOption(/^Kind/, /^Dynamic/);
    fireEvent.click(await screen.findByRole('button', { name: /^Add condition/ }));
    await chooseOption(/^Field$/, /^Visits \(30 days\)/);
    await chooseOption(/^Operator$/, /^is at least/);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value' }), { target: { value: '8' } });
    expect(screen.getByTestId('create-conditions-sentence').textContent).toBe('Reads: Visits (30 days) is at least 8');
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(JSON.stringify(mutations()[0]?.variables)).toContain('"conditions":{"field":"visits_last_30d","operator":"gte","value":8}');
  });

  it('should send no conditions when switched back to manual after conditions were built', async () => {
    renderAt('/segments/create');
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Regulars' } });
    await chooseOption(/^Kind/, /^Dynamic/);
    fireEvent.click(await screen.findByRole('button', { name: /^Add condition/ }));
    await chooseOption(/^Field$/, /^Visits \(30 days\)/);
    await chooseOption(/^Operator$/, /^is at least/);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value' }), { target: { value: '8' } });
    await chooseOption(/^Kind/, /^Manual/);
    expect(screen.queryByText('No conditions yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('"kind":"manual"');
    // segments_conditions_match_kind: the hidden conditions are not sent; the database keeps '{}'.
    expect(sent).not.toContain('conditions');
    expect(sent).not.toContain('visits_last_30d');
  });

  it('should not save a condition on a field the catalog no longer offers (Review Focus 1)', async () => {
    segmentRow = {
      ...SEGMENT_ROW,
      kind: 'dynamic',
      conditions: { op: 'and', children: [{ field: 'status', operator: 'eq', value: 'active' }, { field: 'custom_fields.badge_number', operator: 'eq', value: 'B-1' }] },
    };
    renderAt(`/segments/${SEGMENT}/edit`);
    const node = await screen.findByTestId('segment-node-$.children[1]');
    expect(node.getAttribute('data-invalid')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(screen.getAllByText(/The field “custom_fields.badge_number” is not offered/).length).toBeGreaterThan(0));
    expect(mutations()).toHaveLength(0);
    // Removing the condition lets the segment save without it.
    fireEvent.click(within(node).getByRole('button', { name: 'Remove Condition 2' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(JSON.stringify(mutations()[0]?.variables)).not.toContain('badge_number');
  });
});

describe('segment delete (Review Focus 5)', () => {
  it('should say why the database refuses the delete and stay on the segment', async () => {
    deleteAnswer = { errors: [{ message: 'Check constraint violation. segment_referenced', extensions: { code: 'permission-error' } }] };
    renderAt(`/segments/${SEGMENT}`);
    expect((await screen.findAllByText('Executive floor access')).length).toBeGreaterThan(0);
    fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Delete/ }));
    expect(
      await screen.findByText(/This segment is named by the conditions of a notification rule, of another segment or of a segment template/),
    ).toBeDefined();
    expect(mutations().map((body) => body.query)).toEqual([expect.stringContaining('delete_segments_by_pk')]);
    expect(screen.queryByText(/may have been applied/)).toBeNull();
  });
});

describe('segment templates', () => {
  it('should create a dynamic segment from a built-in template', async () => {
    renderAt(`/segment-templates/${TEMPLATE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Create segment/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/^Segment name/), { target: { value: 'Regulars' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Create segment/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('insert_segments_one');
    expect(mutations()[0]?.variables).toEqual({
      name: 'Regulars',
      description: 'Seen often',
      target: 'profiles',
      conditions: CONDITIONS,
      template: TEMPLATE,
    });
  });
});
