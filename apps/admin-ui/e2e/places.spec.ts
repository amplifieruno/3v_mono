import { type Page, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
const FACILITY = `${RUN} Depot`;
const OUTER = `${RUN} Hall`;
const INNER = `${RUN} Cell`;
const ATTRIBUTE_KEY = `e2e_${Date.now()}`;
const ATTRIBUTE_LABEL = `${RUN} Cost code`;
const POINT = `${RUN} Side door`;
/** A seeded room on the Floor 12 plan (its shape is restored after the drawing step). */
const SEEDED_ROOM = 'Meeting Room 12A';
const TEMPLATE = 'Standard office floor';

/*
 * One browser page for the whole flow, opened from the run's shared admin session
 * (`global-setup.ts`; hasura-auth allows ten sign-ins per five minutes). The run creates a facility with areas and a custom attribute and removes all
 * of it, leaf areas first (an area cannot be deleted while another sits inside it, and a
 * facility not while it has areas). The afterAll sweep repeats that for a failed step.
 */
test.describe.serial('places smoke', () => {
  let page: Page;
  let facilityId = '';

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
  });

  test.afterAll(async () => {
    try {
      await sweep();
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation with the stored organization token (setup, check and restore steps). */
  async function graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

  const like = { m: `${RUN.replace(/[\\%_]/gu, '\\$&')}%` };

  /** Deletes the run's access points and the areas of its facility, deepest first. */
  async function sweepAreas(): Promise<void> {
    await graphql('mutation ($m: String!) { delete_access_points(where: {name: {_like: $m}}) { affected_rows } }', like);
    // Areas of the run's facility, deepest first: only an area with nothing inside can go.
    for (let round = 0; round < 6; round += 1) {
      const result = await graphql<{ delete_areas: { affected_rows: number } }>(
        'mutation ($m: String!) { delete_areas(where: {facility: {name: {_like: $m}}, _not: {children: {}}}) { affected_rows } }',
        like,
      );
      if (result.delete_areas.affected_rows === 0) break;
    }
  }

  /** Deletes everything the run created, in foreign-key order; safe to run when nothing is left. */
  async function sweep(): Promise<void> {
    await sweepAreas();
    await graphql('mutation ($m: String!) { delete_facilities(where: {name: {_like: $m}}) { affected_rows } }', like);
    await graphql(
      'mutation ($k: String!) { delete_custom_attribute_definitions(where: {key: {_like: $k}}) { affected_rows } }',
      { k: `${ATTRIBUTE_KEY.replace(/[\\%_]/gu, '\\$&')}%` },
    );
  }

  /** The areas of the run's facility, by name. */
  async function runAreas(): Promise<string[]> {
    const data = await graphql<{ areas: { name: string }[] }>(
      'query ($m: String!) { areas(where: {facility: {name: {_like: $m}}}, order_by: {name: asc}) { name } }',
      { m: `${RUN}%` },
    );
    return data.areas.map((row) => row.name);
  }

  test('should refuse a facility without its required attribute, then create it', async () => {
    await graphql(
      `mutation ($object: custom_attribute_definitions_insert_input!) {
        insert_custom_attribute_definitions_one(object: $object) { id }
      }`,
      { object: { entity: 'facility', key: ATTRIBUTE_KEY, label: ATTRIBUTE_LABEL, data_type: 'string', required: true } },
    );

    await page.goto('/facilities/create');
    await page.getByTestId('form-field-input:facility:create:name').fill(FACILITY);
    await expect(page.getByLabel(ATTRIBUTE_LABEL)).toBeVisible();
    await page.getByTestId('form-submit:facility:create').click();
    await expect(page).toHaveURL(/\/facilities\/create$/);
    await expect(page.getByText(/is required/i).first()).toBeVisible();

    await page.getByLabel(ATTRIBUTE_LABEL).fill('CC-4417');
    await page.getByTestId('form-submit:facility:create').click();
    await expect(page).toHaveURL(/\/facilities\/[0-9a-f-]{36}$/);
    facilityId = page.url().split('/').pop() ?? '';
    await expect(page.getByText(FACILITY).first()).toBeVisible();
    await expect(page.getByText('CC-4417').first()).toBeVisible();
    await expect(page.getByText('On site now').first()).toBeVisible();
    const stored = await graphql<{ facilities: { custom_fields: Record<string, unknown> }[] }>(
      'query ($id: uuid!) { facilities(where: {id: {_eq: $id}}) { custom_fields } }',
      { id: facilityId },
    );
    expect(stored.facilities[0]?.custom_fields[ATTRIBUTE_KEY]).toBe('CC-4417');
  });

  /** Creates an area on the open create form: a name and a type (the rest keeps its defaults). */
  async function createArea(name: string, type: string): Promise<void> {
    await page.getByTestId('form-field-input:area:create:name').fill(name);
    await page.getByTestId('form-field-input:area:create:area_type').click();
    await page.getByRole('option', { name: new RegExp(`^${type}`) }).click();
    await page.getByTestId('form-submit:area:create').click();
    await expect(page).not.toHaveURL(/\/create/);
  }

  test('should build an area inside another and draw both in the facility tree', async () => {
    await page.goto(`/facilities/${facilityId}?sections=areas`);
    await page.getByRole('link', { name: 'Add area' }).click();
    await expect(page.getByTestId('form-field:area:create:facility_id')).toContainText(FACILITY);
    await createArea(OUTER, 'Building');

    await page.goto(`/facilities/${facilityId}?sections=areas`);
    const tree = page.getByTestId('area-tree');
    await expect(tree.getByText(OUTER)).toBeVisible();
    await tree.getByRole('link', { name: `Add an area inside ${OUTER}` }).click();
    await createArea(INNER, 'Room');
    await expect(page.getByText(OUTER).first()).toBeVisible();

    await page.goto(`/facilities/${facilityId}?sections=areas`);
    await expect(tree.getByText(INNER)).toBeVisible();
    // The inner area sits under the outer one: the outer row is the one that can be collapsed.
    await tree.getByRole('button', { name: `Hide the areas inside ${OUTER}` }).click();
    await expect(tree.getByText(INNER)).toHaveCount(0);
    await tree.getByRole('button', { name: 'Expand all' }).click();
    await expect(tree.getByText(INNER)).toBeVisible();

    const rows = await graphql<{ areas: { name: string; parent: { name: string } | null }[] }>(
      'query ($m: String!) { areas(where: {facility: {name: {_like: $m}}}, order_by: {name: asc}) { name parent { name } } }',
      { m: `${RUN}%` },
    );
    expect(rows.areas).toEqual([
      { name: INNER, parent: { name: OUTER } },
      { name: OUTER, parent: null },
    ]);
  });

  test('should draw a polygon on a seeded floor plan and restore the shape', async () => {
    const found = await graphql<{ areas: { id: string; shape: unknown }[] }>(
      'query ($n: String!) { areas(where: {name: {_eq: $n}, facility: {name: {_eq: "Nova Tower"}}}) { id shape } }',
      { n: SEEDED_ROOM },
    );
    const room = found.areas[0];
    if (!room) throw new Error(`${SEEDED_ROOM} is not seeded`);
    try {
      await page.goto(`/areas/${room.id}/edit`);
      const canvas = page.getByTestId('area-shape-canvas');
      await expect(canvas).toBeVisible();
      await page.getByRole('button', { name: 'Clear shape' }).click();
      const box = await canvas.boundingBox();
      if (!box) throw new Error('the floor plan has no box');
      // Three clicks inside the 1200 x 800 plan: a triangle.
      for (const [x, y] of [[0.25, 0.25], [0.45, 0.25], [0.35, 0.45]] as const) {
        await canvas.click({ position: { x: box.width * x, y: box.height * y } });
      }
      await expect(page.getByText('Polygon, 3 points')).toBeVisible();
      await page.getByTestId('form-submit:area:edit').click();
      await expect(page).toHaveURL(new RegExp(`/areas/${room.id}$`));
      await expect(page.getByText('Polygon, 3 points').first()).toBeVisible();

      const saved = await graphql<{ areas: { shape: { type: string; coordinates: number[][][] } }[] }>(
        'query ($id: uuid!) { areas(where: {id: {_eq: $id}}) { shape } }',
        { id: room.id },
      );
      const ring = saved.areas[0]?.shape.coordinates[0] ?? [];
      // A closed GeoJSON-like ring would repeat its first point; either way every point lies on the plan.
      expect(ring.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of ring) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1200);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(800);
      }
    } finally {
      await graphql('mutation ($id: uuid!, $shape: jsonb) { update_areas_by_pk(pk_columns: {id: $id}, _set: {shape: $shape}) { id } }', {
        id: room.id,
        shape: room.shape,
      });
    }
    const restored = await graphql<{ areas: { shape: unknown }[] }>(
      'query ($id: uuid!) { areas(where: {id: {_eq: $id}}) { shape } }',
      { id: room.id },
    );
    expect(restored.areas[0]?.shape).toEqual(room.shape);
  });

  test('should add an access point with a position on a seeded floor plan', async () => {
    const found = await graphql<{ areas: { id: string; facility_id: string }[] }>(
      'query ($n: String!) { areas(where: {name: {_eq: $n}, facility: {name: {_eq: "Nova Tower"}}}) { id facility_id } }',
      { n: SEEDED_ROOM },
    );
    const room = found.areas[0];
    if (!room) throw new Error(`${SEEDED_ROOM} is not seeded`);

    await page.goto(`/access-points/create?prefill.facility_id=${room.facility_id}&prefill.area_id=${room.id}`);
    await page.getByTestId('form-field-input:access_point:create:name').fill(POINT);
    const canvas = page.getByTestId('plan-position-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('the floor plan has no box');
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.getByText(/^x \d+, y \d+ px$/).first()).toBeVisible();
    await page.getByTestId('form-submit:access_point:create').click();
    await expect(page).toHaveURL(/\/access-points\/[0-9a-f-]{36}$/);
    await expect(page.getByText(POINT).first()).toBeVisible();

    const saved = await graphql<{ access_points: { id: string; position: [number, number] }[] }>(
      'query ($m: String!) { access_points(where: {name: {_like: $m}}) { id position } }',
      { m: `${RUN}%` },
    );
    const point = saved.access_points[0];
    expect(point?.position[0]).toBeGreaterThan(560);
    expect(point?.position[0]).toBeLessThan(640);
    expect(point?.position[1]).toBeGreaterThan(370);
    expect(point?.position[1]).toBeLessThan(430);

    // The seeded floor's plan draws the new point where it was placed.
    const plan = await graphql<{ floor_plans: { id: string }[] }>('query { floor_plans(where: {name: {_eq: "Floor 12"}}) { id } }');
    await page.goto(`/floor-plans/${plan.floor_plans[0]?.id ?? ''}`);
    await expect(page.getByTestId(`floor-plan-access-point:${point?.id ?? ''}`)).toBeVisible();

    // The access point is removed from its row menu on the list.
    await page.goto('/access-points');
    await page.getByPlaceholder(/search/i).first().fill(POINT);
    const row = page.getByRole('row', { name: new RegExp(POINT) });
    await expect(row).toHaveCount(1);
    await row.getByTestId(/^list-row-actions-menu:access_point:/).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: new RegExp(POINT) })).toHaveCount(0);
  });

  test('should apply a template to the facility and report how many areas it created', async () => {
    await page.goto(`/facilities/${facilityId}`);
    await page.getByTestId('form-action:facility:show:apply_template').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /^Template/ }).click();
    await page.getByRole('option', { name: new RegExp(TEMPLATE) }).click();
    await expect(dialog.getByText('Creates 5 areas:')).toBeVisible();
    await dialog.getByRole('button', { name: 'Apply template', exact: true }).click();
    await expect(page.getByText(/Template applied: 5 areas created \(4 at the top: /)).toBeVisible();

    expect((await runAreas()).sort()).toEqual(
      [INNER, OUTER, 'Elevator Lobby', 'Focus Booths', 'Kitchen', 'Meeting Room', 'Open Office'].sort(),
    );
    await page.goto(`/facilities/${facilityId}?sections=areas`);
    await expect(page.getByTestId('area-tree').getByText('Focus Booths')).toBeVisible();
  });

  test('should narrow the areas list to the facility picked in the sidebar', async () => {
    await page.goto('/areas');
    await page.getByTestId('context-picker:facility').click();
    await page.getByRole('option', { name: FACILITY }).click();
    await expect(page.getByText('Showing 1–7 of 7')).toBeVisible();
    await expect(page.getByRole('row', { name: /Focus Booths/ })).toHaveCount(1);
    await expect(page.getByRole('row', { name: /Server Room/ })).toHaveCount(0);

    await page.getByTestId('context-picker:facility').click();
    await page.getByRole('option', { name: 'All facilities' }).click();
    await expect(page.getByText(/Showing 1–10 of (?!7\b)\d+/)).toBeVisible();
  });

  test('should delete the facility once its areas are gone', async () => {
    await page.goto('/facilities');
    // Areas first: the database refuses to delete a facility that still has any.
    await sweepAreas();
    expect(await runAreas()).toEqual([]);
    await page.reload();
    const row = page.getByRole('row', { name: new RegExp(FACILITY) });
    await row.getByTestId(/^list-row-actions-menu:facility:/).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: new RegExp(FACILITY) })).toHaveCount(0);
  });
});
