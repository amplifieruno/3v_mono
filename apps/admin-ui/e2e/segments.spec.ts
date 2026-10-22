import { type Page, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;

/** Fixed segments reused from run to run: a segment that had members keeps its history and is never deleted. */
const MANUAL_NAME = 'E2E: manual membership';
const DYNAMIC_NAME = 'E2E: evaluation';

type Row = Record<string, unknown>;

/*
 * One browser page for the whole flow, opened from the run's shared admin session. The segment
 * the first step creates has no members and is deleted from the console; the two fixed segments
 * are reactivated at the start and left archived with no open membership (manual ones removed,
 * rule ones closed by evaluating the archived segment), like the membership dev test.
 */
test.describe.serial('segments smoke', () => {
  let page: Page;
  let opened = false;
  let person: { id: string; first_name: string; last_name: string };
  const fixed: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    const people = await graphql<{ profiles: { id: string; first_name: string; last_name: string }[] }>(
      '{ profiles(where: {status: {_eq: active}, processing_restricted: {_eq: false}, profile_type: {_eq: employee}}, order_by: {last_name: asc}, limit: 1) { id first_name last_name } }',
    );
    const found = people.profiles[0];
    if (!found) throw new Error('the seed has no active employee in Nova');
    person = found;
  });

  test.afterAll(async () => {
    if (!opened) return;
    try {
      for (const id of fixed) {
        try {
          await removeManual(id);
          await graphql('mutation ($id: uuid!) { update_segments_by_pk(pk_columns: {id: $id}, _set: {status: archived}) { id kind } }', { id });
          const kind = (await graphql<{ segments_by_pk: { kind: string } }>('query ($id: uuid!) { segments_by_pk(id: $id) { kind } }', { id })).segments_by_pk.kind;
          // Evaluated while archived, a dynamic segment matches nobody: its rule memberships close.
          if (kind === 'dynamic') await graphql('mutation ($id: uuid!) { evaluate_segment(segment_id: $id) { member_count } }', { id });
        } catch (error: unknown) {
          const description = `${id}: ${error instanceof Error ? error.message : String(error)}`;
          console.warn(`segments smoke cleanup failed: ${description}`);
          test.info().annotations.push({ type: 'cleanup-failed', description });
        }
      }
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation as the signed-in admin (the stored organization token). */
  async function graphql<T = Row>(query: string, variables: Row = {}): Promise<T> {
    return page.evaluate(
      async ({ q, v }) => {
        const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as { org?: { accessToken: string } };
        const response = await fetch('/v1/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.org?.accessToken ?? ''}` },
          body: JSON.stringify({ query: q, variables: v }),
        });
        const body = (await response.json()) as { data?: unknown; errors?: unknown };
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        return body.data as T;
      },
      { q: query, v: variables },
    );
  }

  /** Ends every open manual membership of the segment (what an interrupted run may have left). */
  async function removeManual(segmentId: string): Promise<void> {
    const open = await graphql<{ segment_members: { profile_id: string }[] }>(
      'query ($s: uuid!) { segment_members(where: {segment_id: {_eq: $s}, removed_at: {_is_null: true}, source: {_eq: manual}}) { profile_id } }',
      { s: segmentId },
    );
    const ids = open.segment_members.map((row) => row.profile_id);
    if (ids.length > 0)
      await graphql('mutation ($s: uuid!, $ids: _uuid!) { remove_segment_members(args: {p_segment: $s, p_ids: $ids}) { id } }', {
        s: segmentId,
        ids: `{${ids.join(',')}}`,
      });
  }

  /** The fixed segment called `name`, made or reactivated with `fields` and no manual member. */
  async function fixedSegment(name: string, fields: Row): Promise<string> {
    const found = await graphql<{ segments: { id: string }[] }>('query ($n: String!) { segments(where: {name: {_eq: $n}}) { id } }', { n: name });
    let id = found.segments[0]?.id;
    if (id === undefined) {
      const made = await graphql<{ insert_segments_one: { id: string } }>(
        'mutation ($o: segments_insert_input!) { insert_segments_one(object: $o) { id } }',
        { o: { name, ...fields } },
      );
      id = made.insert_segments_one.id;
    } else {
      const changeable = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'kind' && key !== 'target'));
      await graphql('mutation ($id: uuid!, $s: segments_set_input!) { update_segments_by_pk(pk_columns: {id: $id}, _set: $s) { id } }', {
        id,
        s: { ...changeable, status: 'active' },
      });
    }
    fixed.push(id);
    await removeManual(id);
    return id;
  }

  /** The memberships of the person in the segment (open and ended), oldest first. */
  const memberships = async (segmentId: string): Promise<{ source: string; removed_at: string | null }[]> =>
    (
      await graphql<{ segment_members: { source: string; removed_at: string | null }[] }>(
        'query ($s: uuid!, $p: uuid!) { segment_members(where: {segment_id: {_eq: $s}, profile_id: {_eq: $p}}, order_by: {added_at: asc}) { source removed_at } }',
        { s: segmentId, p: person.id },
      )
    ).segment_members;
  const openSources = async (segmentId: string): Promise<string[]> =>
    (await memberships(segmentId)).filter((row) => row.removed_at === null).map((row) => row.source);

  const dialogs = (): ReturnType<Page['getByRole']> => page.getByRole('dialog');

  const nameMatches = () => ({
    op: 'and',
    children: [
      { field: 'first_name', operator: 'eq', value: person.first_name },
      { field: 'last_name', operator: 'eq', value: person.last_name },
    ],
  });

  test('should build conditions in the editor, preview them without creating anything, save and delete the segment', async () => {
    const name = `${RUN} dynamic`;
    const count = async (): Promise<number> =>
      (await graphql<{ segments: unknown[] }>('query ($n: String!) { segments(where: {name: {_eq: $n}}) { id } }', { n: name })).segments.length;

    await page.goto('/segments/create');
    await page.getByTestId('form-field-input:segment:create:name').fill(name);
    await page.getByTestId('form-field-input:segment:create:kind').click();
    await page.getByRole('option', { name: /^Dynamic\b/ }).click();
    await page.getByTestId('form-field-input:segment:create:target').click();
    await page.getByRole('option', { name: /^Profiles\b/ }).click();
    // Inactive: the evaluator leaves it alone, so it never has members and can be deleted.
    await page.getByTestId('form-field-input:segment:create:status').click();
    await page.getByRole('option', { name: /^Inactive\b/ }).click();

    // The first condition is the whole tree; the second wraps both in a group (all of these hold).
    const editor = page.getByTestId('form-field-input:segment:create:conditions');
    for (const [path, field, value] of [
      ['$', 'First name', person.first_name],
      ['$.children[1]', 'Last name', person.last_name],
    ]) {
      await editor.getByRole('button', { name: 'Add condition' }).last().click();
      const node = editor.getByTestId(`segment-node-${path}`);
      await node.getByRole('combobox', { name: 'Field' }).click();
      await page.getByRole('option', { name: field, exact: true }).click();
      await node.getByRole('textbox', { name: 'Value' }).fill(value ?? '');
    }
    await expect(editor.getByTestId(/-sentence$/)).toHaveText(`Reads: First name is “${person.first_name}” and Last name is “${person.last_name}”`);

    // The preview counts who would match now: the person is among them, and nothing is created.
    const preview = page.getByTestId('segment-preview');
    await preview.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(preview.getByTestId('segment-preview-count')).toContainText('would be members now');
    await expect(preview.getByTestId('segment-preview-sample')).toContainText(`${person.first_name} ${person.last_name}`);
    expect(await count()).toBe(0);

    await page.getByTestId('form-submit:segment:create').click();
    await expect(page).toHaveURL(/\/segments\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    const saved = (
      await graphql<{ segments_by_pk: { kind: string; target: string; status: string; conditions: Row; member_count: number } }>(
        'query ($id: uuid!) { segments_by_pk(id: $id) { kind target status conditions member_count } }',
        { id },
      )
    ).segments_by_pk;
    expect(saved).toEqual({ kind: 'dynamic', target: 'profiles', status: 'inactive', conditions: nameMatches(), member_count: 0 });

    // Never had members and nothing names it: the console deletes it.
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await dialogs().getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/segments$/);
    await expect.poll(count).toBe(0);
  });

  test('should evaluate a dynamic segment now and show the person as a rule member on their Segments tab', async () => {
    const id = await fixedSegment(DYNAMIC_NAME, { kind: 'dynamic', target: 'profiles', conditions: nameMatches() });
    await page.goto(`/segments/${id}`);
    await page.getByTestId('form-action:segment:show:evaluate_now').click();
    await dialogs().getByRole('button', { name: 'Evaluate now', exact: true }).click();
    await expect(page.getByTestId('segment-evaluation')).toHaveAttribute('data-state', /done|stale/);
    await expect.poll(() => openSources(id)).toEqual(['rule']);
    await page.keyboard.press('Escape');

    await page.goto(`/profiles/${person.id}`);
    await page.getByRole('tab', { name: 'Segments', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Segments' });
    await expect(panel.locator(`[data-testid="relation-display:segment:${id}"]`).first()).toBeVisible();
  });

  test('should add a person by hand, show them as a manual member and remove them, keeping the history', async () => {
    const id = await fixedSegment(MANUAL_NAME, { kind: 'manual', target: 'profiles' });
    const before = (await memberships(id)).length;
    await page.goto(`/segments/${id}`);
    await page.getByTestId('form-action:segment:show:add_profiles').click();
    await dialogs().getByRole('combobox').first().click();
    await page.getByRole('combobox').last().fill(person.last_name);
    // Namesakes are told apart by their id.
    await page.getByRole('option').filter({ hasText: person.id }).first().click();
    await page.keyboard.press('Escape');
    await dialogs().getByRole('button', { name: 'Add members', exact: true }).click();
    await expect(page.getByText('Added by hand: 1.').first()).toBeVisible();
    await expect.poll(() => openSources(id)).toEqual(['manual']);

    await page.getByRole('tab', { name: 'Members', exact: true }).click();
    // The open membership's row (earlier runs left ended ones in the history list below).
    const openRow = (
      await graphql<{ segment_members: { id: string }[] }>(
        'query ($s: uuid!) { segment_members(where: {segment_id: {_eq: $s}, removed_at: {_is_null: true}}) { id } }',
        { s: id },
      )
    ).segment_members;
    expect(openRow).toHaveLength(1);
    const current = page.getByTestId(`list-row:segment_profile_member:${openRow[0]?.id ?? ''}`);
    await expect(current).toHaveCount(1);
    await current.first().getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Remove from segment' }).click();
    await dialogs().getByRole('button', { name: 'Remove from segment', exact: true }).click();
    await expect(page.getByText('Memberships ended: 1.').first()).toBeVisible();
    await expect.poll(() => openSources(id)).toEqual([]);
    expect(await memberships(id)).toHaveLength(before + 1);
  });
});
