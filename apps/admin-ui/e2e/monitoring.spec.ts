import { type Page, expect, test } from '@playwright/test';
import { DEV_GRAPHQL } from '../tests/support/dev-hosts';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;

type Row = Record<string, unknown>;

/*
 * One browser page for the whole flow, opened from the run's shared admin session. Setup creates
 * what the steps change (an incident, a handover sent by another member) and the sweep deletes it
 * with the Hasura admin secret (`GRAPHQL_ADMIN_SECRET`, an incident or a handover is history for
 * `org_admin`). What the run edits on seeded rows is put back: the event rule is rolled back to
 * its first version (the draft version the run made is deleted), the watch-list entry is removed,
 * the default workspace gets its layout back.
 */
test.describe.serial('monitoring smoke', () => {
  let page: Page;
  let opened = false;
  let me = '';
  const sweep: { name: string; run: () => Promise<unknown> }[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    const claims = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as { org?: { accessToken: string } };
      const payload = (stored.org?.accessToken ?? '').split('.')[1] ?? '';
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    });
    const hasura = claims['https://hasura.io/jwt/claims'] as Record<string, string>;
    me = hasura['x-hasura-user-id'] ?? '';
  });

  test.afterAll(async () => {
    if (!opened) return;
    try {
      // Newest first: a later step's leftovers go before what they were made from.
      for (const step of sweep.reverse()) {
        try {
          await step.run();
        } catch (error: unknown) {
          const description = `${step.name}: ${error instanceof Error ? error.message : String(error)}`;
          console.warn(`monitoring smoke cleanup failed: ${description}`);
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

  /** Runs one GraphQL operation with the Hasura admin secret (setup and sweep of rows `org_admin` may not delete). */
  async function asAdmin<T = Row>(query: string, variables: Row = {}): Promise<T> {
    const secret = process.env.GRAPHQL_ADMIN_SECRET;
    if (!secret) throw new Error('GRAPHQL_ADMIN_SECRET is not set (see apps/backend/.env).');
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': secret },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: unknown; errors?: unknown };
    if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
    return body.data as T;
  }

  const dialogs = (): ReturnType<Page['getByRole']> => page.getByRole('dialog');

  test('should filter the detections by an area and list only that area', async () => {
    await page.goto('/detections');
    const cells = page.locator('[data-testid^="list-cell:detection:"][data-testid$=":area_id"]');
    await expect(cells.first()).toBeVisible();
    // An area other than the newest detection's, so the filter has something to remove.
    const before = (await cells.allTextContents()).map((text) => text.trim()).filter((text) => text !== '');
    const area = before.find((name) => name !== before[0]) ?? before[0];
    if (area === undefined) throw new Error('the seed has no detection with an area');
    expect(new Set(before).size).toBeGreaterThan(0);
    await page.getByTestId('list-filter:detection:pinned:area_id').click();
    await dialogs().getByRole('combobox').fill(area);
    await dialogs().getByRole('option', { name: area, exact: true }).click();
    await page.keyboard.press('Escape');
    // Rows of that area only (the list is empty for an instant while it reloads with the filter).
    let after: string[] = [];
    await expect
      .poll(async () => {
        after = (await cells.allTextContents()).map((text) => text.trim());
        return after.length > 0 && after.every((name) => name === area);
      })
      .toBe(true);
    // The database agrees: the area has detections and the first listed one is in it.
    const count = await graphql<{ detections_aggregate: { aggregate: { count: number } } }>(
      'query ($name: String!) { detections_aggregate(where: {area: {name: {_eq: $name}}}) { aggregate { count } } }',
      { name: area },
    );
    expect(count.detections_aggregate.aggregate.count).toBeGreaterThanOrEqual(after.length);
  });

  test('should open the path of a tracking session with a step for every location', async () => {
    const found = await graphql<{ tracking_sessions: { id: string; identity_locations_aggregate: { aggregate: { count: number } } }[] }>(
      `{ tracking_sessions(order_by: {started_at: desc}, limit: 400) { id identity_locations_aggregate { aggregate { count } } } }`,
    );
    const session = found.tracking_sessions.find((row) => {
      const n = row.identity_locations_aggregate.aggregate.count;
      return n >= 2;
    });
    if (!session) throw new Error('the seed has no session with a path of several steps');
    const steps = session.identity_locations_aggregate.aggregate.count;
    await page.goto(`/tracking-sessions/${session.id}`);
    await page.getByRole('tab', { name: 'Path' }).click();
    const rows = page.locator('[data-testid^="list-row:identity_location:"]');
    await expect(rows.first()).toBeVisible();
    await expect(rows).toHaveCount(steps);
  });

  test('should acknowledge, investigate and resolve an incident, with a note, and record each step', async () => {
    const facilities = await graphql<{ facilities: { id: string }[] }>('{ facilities(limit: 1, order_by: {name: asc}) { id } }');
    const created = await graphql<{ insert_incidents_one: { id: string; code: string } }>(
      'mutation ($o: incidents_insert_input!) { insert_incidents_one(object: $o) { id code } }',
      { o: { title: `${RUN} incident`, severity: 'low', facility_id: facilities.facilities[0]?.id } },
    );
    const incident = created.insert_incidents_one;
    sweep.push({
      name: `delete incident ${incident.code}`,
      run: () => asAdmin('mutation ($id: uuid!) { delete_incidents_by_pk(id: $id) { id } }', { id: incident.id }),
    });
    const state = async (): Promise<{ status: string; disposition: string | null; resolution: string | null; acknowledged_at: string | null }> =>
      (
        await graphql<{ incidents_by_pk: { status: string; disposition: string | null; resolution: string | null; acknowledged_at: string | null } }>(
          'query ($id: uuid!) { incidents_by_pk(id: $id) { status disposition resolution acknowledged_at } }',
          { id: incident.id },
        )
      ).incidents_by_pk;
    const kinds = async (): Promise<string[]> =>
      (
        await graphql<{ incident_activities: { kind: string; details: Row }[] }>(
          'query ($id: uuid!) { incident_activities(where: {incident_id: {_eq: $id}}, order_by: {occurred_at: asc}) { kind details } }',
          { id: incident.id },
        )
      ).incident_activities.map((a) => `${a.kind}:${String(a.details.to ?? '')}`);

    await page.goto(`/incidents/${incident.id}`);
    await expect(page.getByText(incident.code).first()).toBeVisible();
    expect((await state()).status).toBe('open');

    await page.getByTestId('form-action:incident:show:acknowledge').click();
    await expect.poll(async () => (await state()).status).toBe('acknowledged');
    expect((await state()).acknowledged_at).not.toBeNull();
    await expect(page.getByTestId('form-action:incident:show:acknowledge')).toHaveCount(0);

    await page.getByTestId('form-action:incident:show:start_investigation').click();
    await expect.poll(async () => (await state()).status).toBe('investigating');

    // A note on the Notes tab: it is saved and the timeline records it.
    await page.getByRole('tab', { name: 'Notes' }).click();
    await page.getByRole('tabpanel', { name: 'Notes' }).getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByTestId('form-field-input:incident_note:create:body').fill(`${RUN} note`);
    await page.getByTestId('form-submit:incident_note:create').click();
    await expect.poll(async () => (await kinds()).some((k) => k.startsWith('note'))).toBe(true);
    const notes = await graphql<{ incident_notes: { body: string }[] }>(
      'query ($id: uuid!) { incident_notes(where: {incident_id: {_eq: $id}}) { body } }',
      { id: incident.id },
    );
    expect(notes.incident_notes.map((n) => n.body)).toEqual([`${RUN} note`]);

    await page.goto(`/incidents/${incident.id}`);
    await page.getByTestId('form-action:incident:show:resolve').click();
    await dialogs().getByRole('combobox').click();
    await page.getByRole('option', { name: 'False alarm' }).click();
    await dialogs().getByRole('textbox').fill(`${RUN} resolved`);
    await dialogs().getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect.poll(async () => (await state()).status).toBe('resolved');
    const resolved = await state();
    expect(resolved.disposition).toBe('false_positive');
    expect(resolved.resolution).toBe(`${RUN} resolved`);

    // The timeline holds each step, in order, written by the server.
    const steps = await kinds();
    const order = ['status_change:acknowledged', 'status_change:investigating', 'status_change:resolved'].map((k) => steps.indexOf(k));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('should edit the draft of an event rule and publish it as a new version', async () => {
    type Version = { id: string; version: number; status: string; parameters: Row };
    const ruleData = await graphql<{ event_rules: { id: string; current_version_id: string; event_rule_versions: Version[] }[] }>(
      `{ event_rules(where: {rule_type: {_eq: unusual_dwell}}, order_by: {code: asc}, limit: 1) {
        id current_version_id event_rule_versions(order_by: {version: asc}) { id version status parameters } } }`,
    );
    const rule = ruleData.event_rules[0];
    const inForce = rule?.event_rule_versions.find((v) => v.id === rule.current_version_id);
    if (!rule || !inForce) throw new Error('the seed has no unusual-dwell rule with a version in force');
    const before = Number(inForce.parameters.dwell_seconds);
    const minutes = Math.round(before / 60) + 7;
    const versionsOf = async (): Promise<Version[]> =>
      (
        await graphql<{ event_rule_versions: Version[] }>(
          'query ($id: uuid!) { event_rule_versions(where: {rule_id: {_eq: $id}}, order_by: {version: asc}) { id version status parameters } }',
          { id: rule.id },
        )
      ).event_rule_versions;
    // Put back: the version in force goes back into force; the version the run made is deleted.
    sweep.push({
      name: 'restore the event rule',
      run: async () => {
        await graphql('mutation ($v: uuid!) { publish_event_rule_version(args: {p_version: $v}) { id } }', { v: inForce.id });
        const extra = (await versionsOf()).filter((v) => v.version > Math.max(...rule.event_rule_versions.map((x) => x.version)));
        for (const v of extra) {
          await asAdmin('mutation ($id: uuid!) { delete_event_rule_versions_by_pk(id: $id) { id } }', { id: v.id });
        }
      },
    });

    await page.goto(`/event-rules/${rule.id}`);
    await page.getByTestId('form-action:event_rule:show:edit_draft').click();
    await expect(page).toHaveURL(/\/event-rule-versions\/[0-9a-f-]{36}\/edit$/);
    const draftId = page.url().split('/').slice(-2)[0] ?? '';
    await page.getByRole('spinbutton').first().fill(String(minutes));
    await page.getByTestId('form-submit:event_rule_version:edit').click();
    await expect.poll(async () => (await versionsOf()).find((v) => v.id === draftId)?.parameters.dwell_seconds).toBe(minutes * 60);
    // Still a draft: the version in force applies until the draft is published.
    expect((await versionsOf()).find((v) => v.id === draftId)?.status).toBe('draft');
    expect((await versionsOf()).find((v) => v.id === inForce.id)?.parameters.dwell_seconds).toBe(before);

    await page.goto(`/event-rule-versions/${draftId}`);
    await page.getByTestId('form-action:event_rule_version:show:publish').click();
    await dialogs().getByRole('button', { name: 'Publish', exact: true }).click();
    await expect.poll(async () => (await versionsOf()).find((v) => v.id === draftId)?.status).toBe('published');
    expect((await versionsOf()).find((v) => v.id === inForce.id)?.status).toBe('superseded');
  });

  test('should add a person to a watch list and remove the entry again', async () => {
    const lists = await graphql<{ watch_lists: { id: string; name: string }[] }>(
      '{ watch_lists(where: {kind: {_eq: watch}}, order_by: {name: asc}, limit: 1) { id name } }',
    );
    const list = lists.watch_lists[0];
    if (!list) throw new Error('the seed has no watch list');
    const people = await graphql<{ profiles: { id: string; first_name: string; last_name: string }[] }>(
      `query ($l: uuid!) { profiles(where: {status: {_eq: active}, profile_type: {_eq: employee}, _not: {watch_list_entries: {watch_list_id: {_eq: $l}}}},
        order_by: {last_name: asc}, limit: 1) { id first_name last_name } }`,
      { l: list.id },
    );
    const person = people.profiles[0];
    if (!person) throw new Error('every employee is on the watch list already');
    const entries = async (): Promise<{ id: string; reason: string | null }[]> =>
      (
        await graphql<{ watch_list_entries: { id: string; reason: string | null }[] }>(
          'query ($l: uuid!, $p: uuid!) { watch_list_entries(where: {watch_list_id: {_eq: $l}, profile_id: {_eq: $p}}) { id reason } }',
          { l: list.id, p: person.id },
        )
      ).watch_list_entries;
    sweep.push({
      name: 'remove the watch-list entry',
      run: async () => {
        for (const entry of await entries()) {
          await graphql('mutation ($id: uuid!) { delete_watch_list_entries_by_pk(id: $id) { id } }', { id: entry.id });
        }
      },
    });
    expect(await entries()).toHaveLength(0);

    await page.goto(`/watch-lists/${list.id}`);
    await page.getByRole('tab', { name: 'People' }).click();
    await page.getByRole('tabpanel', { name: 'People' }).getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByTestId('form-field-input:watch_list_profile_entry:create:reason').fill(`${RUN} reason`);
    await page.getByTestId('form-field-input:watch_list_profile_entry:create:profile_id').click();
    await page.getByRole('combobox').last().fill(person.last_name);
    await page.getByRole('option', { name: new RegExp(person.last_name) }).first().click();
    await page.getByTestId('form-submit:watch_list_profile_entry:create').click();
    await expect.poll(async () => (await entries()).map((e) => e.reason)).toEqual([`${RUN} reason`]);
    await expect(page.getByText(`${RUN} reason`)).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(RUN) });
    await row.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await dialogs().getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await entries()).length).toBe(0);
  });

  test('should acknowledge a handover addressed to the admin and freeze it', async () => {
    const members = await graphql<{ organization_members: { organization_id: string; user_id: string }[] }>(
      '{ organization_members(where: {status: {_eq: active}}, order_by: {created_at: asc}) { organization_id user_id } }',
    );
    const sender = members.organization_members.find((m) => m.user_id !== me);
    if (!sender) throw new Error('Nova has no second active member to send the handover');
    const created = await asAdmin<{ insert_shift_handovers_one: { id: string } }>(
      'mutation ($o: shift_handovers_insert_input!) { insert_shift_handovers_one(object: $o) { id } }',
      {
        o: {
          organization_id: sender.organization_id,
          from_user_id: sender.user_id,
          to_user_id: me,
          shift_started_at: new Date(Date.now() - 8 * 3_600_000).toISOString(),
          shift_ended_at: new Date().toISOString(),
          summary: `${RUN} handover`,
        },
      },
    );
    const id = created.insert_shift_handovers_one.id;
    sweep.push({
      name: 'delete the handover',
      run: () => asAdmin('mutation ($id: uuid!) { delete_shift_handovers_by_pk(id: $id) { id } }', { id }),
    });
    const row = async (): Promise<{ acknowledged_at: string | null; addressed_to_me: boolean }> =>
      (
        await graphql<{ shift_handovers_by_pk: { acknowledged_at: string | null; addressed_to_me: boolean } }>(
          'query ($id: uuid!) { shift_handovers_by_pk(id: $id) { acknowledged_at addressed_to_me } }',
          { id },
        )
      ).shift_handovers_by_pk;
    expect(await row()).toEqual({ acknowledged_at: null, addressed_to_me: true });

    await page.goto(`/shift-handovers/${id}`);
    await expect(page.getByText(`${RUN} handover`).first()).toBeVisible();
    await page.getByTestId('form-action:shift_handover:show:acknowledge').click();
    await expect.poll(async () => (await row()).acknowledged_at).not.toBeNull();
    const stamp = new Date((await row()).acknowledged_at ?? '').getTime();
    expect(Math.abs(Date.now() - stamp)).toBeLessThan(5 * 60_000);
    // Frozen from then on: nothing left to acknowledge.
    await expect(page.getByTestId('form-action:shift_handover:show:acknowledge')).toHaveCount(0);
  });

  test('should load the operator workspace with the live wall and save a layout change', async () => {
    const found = await graphql<{ operator_workspaces: { id: string; layout: Row }[] }>(
      '{ operator_workspaces(order_by: [{is_default: desc}, {created_at: asc}], limit: 1) { id layout } }',
    );
    const workspace = found.operator_workspaces[0];
    if (!workspace) throw new Error('the seed has no operator workspace for the admin');
    const original = workspace.layout;
    sweep.push({
      name: 'restore the workspace layout',
      run: () =>
        graphql('mutation ($id: uuid!, $l: jsonb!) { update_operator_workspaces_by_pk(pk_columns: {id: $id}, _set: {layout: $l}) { id } }', {
          id: workspace.id,
          l: original,
        }),
    });
    const layoutOf = async (): Promise<Row> =>
      (
        await graphql<{ operator_workspaces_by_pk: { layout: Row } }>(
          'query ($id: uuid!) { operator_workspaces_by_pk(id: $id) { layout } }',
          { id: workspace.id },
        )
      ).operator_workspaces_by_pk.layout;

    // The wall shows cameras running recognition (the seeded ones are off). A seeded camera would
    // run real recognition on faces and leave unknown identities behind, so the run adds its own
    // camera instead: inactive (neither the recognition manager nor the health check touches an
    // inactive camera) on a stream id the stream server does not have, deleted by the sweep.
    const seeded = await graphql<{ devices: { organization_id: string; facility_id: string }[] }>(
      '{ devices(where: {device_type: {_in: [static_video_camera, ptz_camera]}, stream_url: {_is_null: false}}, limit: 1) { organization_id facility_id } }',
    );
    const place = seeded.devices[0];
    if (!place) throw new Error('the seed has no camera');
    const created = await asAdmin<{ insert_devices_one: { id: string; name: string } }>(
      'mutation ($o: devices_insert_input!) { insert_devices_one(object: $o) { id name } }',
      {
        o: {
          organization_id: place.organization_id,
          facility_id: place.facility_id,
          name: `${RUN} camera`,
          device_type: 'static_video_camera',
          status: 'inactive',
          recognition_enabled: true,
          stream_url: `rtsp://mediamtx:8554/${RUN}`,
        },
      },
    );
    const camera = created.insert_devices_one;
    sweep.push({
      name: 'delete the test camera',
      run: () => asAdmin('mutation ($id: uuid!) { delete_devices_by_pk(id: $id) { id } }', { id: camera.id }),
    });

    // Start from a layout that shows every panel, so the change is a visible difference.
    await graphql('mutation ($id: uuid!, $l: jsonb!) { update_operator_workspaces_by_pk(pk_columns: {id: $id}, _set: {layout: $l}) { id } }', {
      id: workspace.id,
      l: { panels: ['cameras', 'incidents', 'events', 'occupancy'] },
    });
    await page.goto('/workspace');
    await expect(page.getByTestId('live-wall').getByRole('link', { name: camera.name, exact: true })).toBeVisible();
    for (const title of ['Live cameras', 'Open incidents', 'Latest events', 'Occupancy']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }

    await page.goto(`/operator-workspaces/${workspace.id}/edit`);
    await page.getByRole('checkbox', { name: /Occupancy/ }).click();
    await page.getByTestId('form-submit:operator_workspace:edit').click();
    await expect.poll(async () => (await layoutOf()).panels).toEqual(['cameras', 'incidents', 'events']);

    await page.goto('/workspace');
    await expect(page.getByTestId('live-wall')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open incidents' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Occupancy' })).toHaveCount(0);
  });
});
