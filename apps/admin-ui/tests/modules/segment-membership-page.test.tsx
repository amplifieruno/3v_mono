// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { catalogAnswer } from '../support/segment-conditions-fixture';

/**
 * Preview, evaluation and membership on screen: the form of a dynamic segment previews the
 * conditions on screen without saving anything (Review Focus 3) and says when they changed since;
 * a refused preview names the condition; "Evaluate now" shows who joined and left; the Members tab
 * lists current members with their source (a pinned rule member shows Manual, Review Focus 4) and
 * the earlier memberships; a profile has a Segments tab and "Add to segment".
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SEGMENT = '22222222-2222-4222-8222-000000000001';
const PERSON = '44444444-4444-4444-8444-000000000001';

const SEGMENT_ROW = {
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  id: SEGMENT,
  code: 'SEGMENT-00003',
  name: 'Regulars',
  description: null,
  color: null,
  icon: null,
  kind: 'dynamic',
  target: 'profiles',
  conditions: { field: 'visits_last_30d', operator: 'gte', value: 8 },
  status: 'active',
  active_from: null,
  active_until: null,
  schedule: null,
  member_count: 2,
  last_evaluated_at: '2026-10-22T09:00:00Z',
  last_evaluation_error: null,
  last_evaluation_failed_at: null,
  template_id: null,
};
const PERSON_ROW = { id: PERSON, code: 'PROFILE-00001', first_name: 'Ada', last_name: 'Byron', profile_type: 'employee', status: 'active' };
const membership = (id: number, extra: Record<string, unknown>) => ({
  id: `88888888-8888-4888-8888-00000000000${id}`,
  segment_id: SEGMENT,
  profile_id: PERSON,
  added_by: null,
  removed_by: null,
  ...extra,
});
// Ada was a rule member, then added by hand: the rule row ended and a manual one began (a pin).
const PINNED = membership(1, { source: 'manual', added_at: '2026-10-20T08:00:00Z', removed_at: null });
const ENDED_RULE = membership(2, { source: 'rule', added_at: '2026-10-01T08:00:00Z', removed_at: '2026-10-20T08:00:00Z' });

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = () => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));
const previews = () => bodies().filter((body) => body.query.includes('preview_segment('));

let previewAnswer: unknown = {
  data: { preview_segment: { count: 12, sample_ids: [PERSON], sample_labels: ['Ada Byron'] } },
};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('preview_segment(')) return hasuraResponse(previewAnswer);
  if (query.includes('evaluate_segment(')) {
    return hasuraResponse({
      data: { evaluate_segment: { segment_id: SEGMENT, added: 3, removed: 1, member_count: 42, evaluated_at: '2026-10-22T10:00:00Z', stale: false } },
    });
  }
  if (query.includes('segment_fields(')) return hasuraResponse(catalogAnswer());
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('segments_by_pk')) return hasuraResponse({ data: { item: SEGMENT_ROW } });
  if (query.includes('profiles_by_pk')) return hasuraResponse({ data: { item: PERSON_ROW } });
  if (/\bitems: segment_members\(/.test(query)) {
    const where = JSON.stringify(variables ?? {});
    return hasuraResponse({ data: { items: where.includes('"_is_null":true') ? [PINNED] : [ENDED_RULE] } });
  }
  if (/\bitems: profiles\(/.test(query)) return hasuraResponse({ data: { items: [PERSON_ROW] } });
  if (/\bitems: segments\(/.test(query)) return hasuraResponse({ data: { items: [SEGMENT_ROW] } });
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
  previewAnswer = { data: { preview_segment: { count: 12, sample_ids: [PERSON], sample_labels: ['Ada Byron'] } } };
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A new dynamic segment of profiles with "Visits (30 days) is at least 8". */
async function newDynamicSegment(): Promise<void> {
  renderAt('/segments/create');
  fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Regulars' } });
  await chooseOption(/^Kind/, /^Dynamic/);
  fireEvent.click(await screen.findByRole('button', { name: /^Add condition/ }));
  await chooseOption(/^Field$/, /^Visits \(30 days\)/);
  await chooseOption(/^Operator$/, /^is at least/);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Value' }), { target: { value: '8' } });
}

describe('segment preview (Review Focus 3)', () => {
  it('should preview unsaved conditions without creating anything', async () => {
    await newDynamicSegment();
    const preview = await screen.findByTestId('segment-preview');
    fireEvent.click(within(preview).getByRole('button', { name: /^Preview/ }));
    expect(await within(preview).findByText('12 would be members now.')).toBeDefined();
    expect(within(preview).getByRole('link', { name: 'Ada Byron' })).toBeDefined();
    expect(within(preview).getByText('and 11 more')).toBeDefined();
    expect(previews()[0]?.variables).toEqual({
      target: 'profiles',
      conditions: { field: 'visits_last_30d', operator: 'gte', value: 8 },
      limit: 10,
    });
    expect(mutations()).toHaveLength(0);
    // The conditions change: the answer stays, marked as no longer theirs.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value' }), { target: { value: '9' } });
    expect(await within(preview).findByText(/The conditions changed since this preview/)).toBeDefined();
    fireEvent.click(within(preview).getByRole('button', { name: /^Preview again/ }));
    await waitFor(() => expect(previews()).toHaveLength(2));
    expect(JSON.stringify(previews()[1]?.variables)).toContain('"value":9');
    expect(mutations()).toHaveLength(0);
  });

  it('should name the condition the server refused', async () => {
    previewAnswer = {
      errors: [{ message: 'segment_condition_invalid:$.value', extensions: { code: 'segment_condition_invalid' } }],
    };
    await newDynamicSegment();
    const preview = await screen.findByTestId('segment-preview');
    fireEvent.click(within(preview).getByRole('button', { name: /^Preview/ }));
    expect(await within(preview).findByText(/The server refused the value of the condition on “visits_last_30d”/)).toBeDefined();
  });

  it('should offer no preview on a manual segment', async () => {
    renderAt('/segments/create');
    await screen.findByLabelText(/^Name/);
    expect(screen.queryByTestId('segment-preview')).toBeNull();
  });
});

describe('segment evaluation and members', () => {
  it('should evaluate a dynamic segment now and say who joined and left', async () => {
    renderAt(`/segments/${SEGMENT}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Evaluate now/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/The conditions are applied now/)).toBeDefined();
    expect(mutations()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Evaluate now/ }));
    expect(await screen.findByText('Evaluated: 3 joined and 1 left by rule.')).toBeDefined();
    expect(screen.getByText('The segment has 42 members now.')).toBeDefined();
    expect(mutations().map((body) => body.variables)).toEqual([{ id: SEGMENT }]);
  });

  it('should list current members with their source and the earlier memberships (Review Focus 4)', async () => {
    renderAt(`/segments/${SEGMENT}?sections=members`);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Members' }));
    expect(await screen.findByText('Current members')).toBeDefined();
    expect(screen.getByText('Earlier memberships')).toBeDefined();
    await waitFor(() => expect(screen.getAllByText('Manual').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Rule').length).toBeGreaterThan(0);
  });
});

describe('a person’s segments', () => {
  it('should show the Segments tab and offer Add to segment', async () => {
    renderAt(`/profiles/${PERSON}`);
    const tab = await screen.findByRole('tab', { name: 'Segments' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText('Member now')).toBeDefined();
    fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: /Add to segment/ })).toBeDefined();
  });
});
