import { type Page, expect, test } from '@playwright/test';
import { DEV_GRAPHQL } from '../tests/support/dev-hosts';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;

type Row = Record<string, unknown>;

/*
 * One browser page for the whole flow, opened from the run's shared admin session. Everything the
 * steps create (a rule, a group, a policy, a subscription, a webhook, an inbox row) is recorded in
 * `sweep` and deleted afterwards, newest first, with the admin's own token or, for rows the
 * `org_admin` role may not delete, with the Hasura admin secret (`GRAPHQL_ADMIN_SECRET`).
 */
test.describe.serial('notifications smoke', () => {
  let page: Page;
  let opened = false;
  let me = '';
  let organization = '';
  let ruleId = '';
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
    organization = hasura['x-hasura-org-id'] ?? hasura['x-hasura-organization-id'] ?? '';
  });

  test.afterAll(async () => {
    if (!opened) return;
    try {
      for (const step of sweep.reverse()) {
        try {
          await step.run();
        } catch (error: unknown) {
          const description = `${step.name}: ${error instanceof Error ? error.message : String(error)}`;
          console.warn(`notifications smoke cleanup failed: ${description}`);
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

  /** Runs one GraphQL operation with the Hasura admin secret (setup and sweep of rows `org_admin` may not touch). */
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

  const count = async (table: string, where: string): Promise<number> =>
    (await asAdmin<Record<string, { aggregate: { count: number } }>>(`{ ${table}_aggregate(where: ${where}) { aggregate { count } } }`))[`${table}_aggregate`]
      ?.aggregate.count ?? -1;

  const dialogs = (): ReturnType<Page['getByRole']> => page.getByRole('dialog');

  /** Picks the first option of a relation field whose search box takes `text`. */
  async function pickRelation(testId: string, text?: string): Promise<void> {
    await page.getByTestId(testId).click();
    if (text !== undefined) await page.getByRole('combobox').last().fill(text);
    await page.getByRole('option').first().click();
  }

  test('should create a notification rule with a condition, an event type and a channel, and test it without creating a delivery', async () => {
    const deliveriesBefore = await count('notification_deliveries', '{}');
    const inboxBefore = await count('user_notifications', '{}');
    await page.goto('/notification-rules/create');
    await page.getByTestId('form-field-input:notification_rule:create:name').fill(`${RUN} rule`);
    await page.getByRole('combobox', { name: 'Minimum severity' }).click();
    await page.getByRole('option', { name: 'High', exact: true }).click();
    await page.getByTestId('form-submit:notification_rule:create').click();
    await expect(page).toHaveURL(/\/notification-rules\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    ruleId = id;
    sweep.push({
      name: 'delete the rule',
      run: () => graphql('mutation ($id: uuid!) { delete_notification_rules_by_pk(id: $id) { id } }', { id }),
    });
    const rule = (
      await graphql<{ notification_rules_by_pk: { name: string; conditions: Row } }>(
        'query ($id: uuid!) { notification_rules_by_pk(id: $id) { name conditions } }',
        { id },
      )
    ).notification_rules_by_pk;
    expect(rule.name).toBe(`${RUN} rule`);
    expect(rule.conditions).toEqual({ min_severity: 'high' });

    await page.getByRole('tab', { name: 'Event types' }).click();
    await page.getByTestId('list-create:notification_rule_event_type').click();
    await page.getByTestId('form-field-input:notification_rule_event_type:create:event_type').click();
    await page.getByRole('option', { name: /^Restricted area entry\b/ }).click();
    await page.getByTestId('form-submit:notification_rule_event_type:create').click();
    await page.getByRole('tab', { name: 'Channels' }).click();
    await page.getByTestId('list-create:notification_rule_channel').click();
    await page.getByTestId('form-field-input:notification_rule_channel:create:channel').click();
    await page.getByRole('option', { name: /^In-app\b/ }).click();
    await page.getByTestId('form-submit:notification_rule_channel:create').click();
    await expect
      .poll(async () => {
        const data = await graphql<{ notification_rule_event_types: { event_type: string }[]; notification_rule_channels: { channel: string }[] }>(
          'query ($id: uuid!) { notification_rule_event_types(where: {rule_id: {_eq: $id}}) { event_type } notification_rule_channels(where: {rule_id: {_eq: $id}}) { channel } }',
          { id },
        );
        return [data.notification_rule_event_types.map((r) => r.event_type), data.notification_rule_channels.map((r) => r.channel)];
      })
      .toEqual([['restricted_area_entry'], ['in_app']]);

    await page.goto(`/notification-rules/${id}`);
    await page.getByTestId('form-action:notification_rule:show:test').click();
    await expect(page.getByTestId('rule-test-summary')).toBeVisible();
    await page.locator('#rule-test-limit').click();
    await page.getByRole('option', { name: '100', exact: true }).click();
    const rows = page.getByTestId('rule-test-row');
    await expect(rows.first()).toBeVisible();
    await expect.poll(() => rows.count()).toBeGreaterThan(20);
    const results = await rows.evaluateAll((els) =>
      els.map((el) => ({
        reason: el.getAttribute('data-reason'),
        type: el.querySelector('[data-testid^="enum-badge:event_type:"]')?.getAttribute('data-testid')?.split(':').pop(),
        severity: el.querySelector('[data-testid^="enum-badge:event_severity:"]')?.getAttribute('data-testid')?.split(':').pop(),
      })),
    );
    // A match is an entry to a restricted area at least as severe as the condition; the rest says why not.
    const matches = results.filter((row) => row.reason === 'match');
    expect(matches.length).toBeGreaterThan(0);
    for (const row of matches) {
      expect(row.type).toBe('restricted_area_entry');
      expect(['high', 'critical']).toContain(row.severity);
    }
    for (const row of results.filter((r) => r.reason !== 'match')) {
      expect(row.reason).toBe(row.type === 'restricted_area_entry' ? 'condition_mismatch' : 'event_type_mismatch');
    }
    await expect(page.getByTestId('rule-test-summary')).toContainText(String(matches.length));
    await page.keyboard.press('Escape');
    // A test is a dry run: nothing was delivered or put in an inbox.
    expect(await count('notification_deliveries', `{rule_id: {_eq: "${id}"}}`)).toBe(0);
    expect(await count('notification_deliveries', '{}')).toBe(deliveriesBefore);
    expect(await count('user_notifications', '{}')).toBe(inboxBefore);
  });

  let groupId = '';
  const groupName = `${RUN} group`;

  test('should create a recipient group with a user member and an external address', async () => {
    await page.goto('/recipient-groups/create');
    await page.getByTestId('form-field-input:recipient_group:create:name').fill(groupName);
    await page.getByTestId('form-submit:recipient_group:create').click();
    await expect(page).toHaveURL(/\/recipient-groups\/[0-9a-f-]{36}$/);
    groupId = page.url().split('/').pop() ?? '';
    sweep.push({
      name: 'delete the recipient group',
      run: () => graphql('mutation ($id: uuid!) { delete_recipient_groups_by_pk(id: $id) { id } }', { id: groupId }),
    });

    await page.getByTestId('list-create:recipient_group_user_member').click();
    await pickRelation('form-field-input:recipient_group_user_member:create:user_id');
    await page.getByTestId('form-field-input:recipient_group_user_member:create:channel').click();
    await page.getByRole('option', { name: /^In-app\b/ }).click();
    await page.getByTestId('form-submit:recipient_group_user_member:create').click();

    const address = `${RUN}@example.com`;
    await page.getByRole('tab', { name: 'External addresses' }).click();
    await page.getByTestId('list-create:recipient_group_address_member').click();
    await page.getByTestId('form-field-input:recipient_group_address_member:create:channel').click();
    await page.getByRole('option', { name: /^Email\b/ }).click();
    await page.getByTestId('form-field-input:recipient_group_address_member:create:external_address').fill(address);
    await page.getByTestId('form-submit:recipient_group_address_member:create').click();

    await expect
      .poll(async () => {
        const data = await graphql<{ recipient_group_members: { user_id: string | null; channel: string; external_address: string | null }[] }>(
          'query ($g: uuid!) { recipient_group_members(where: {group_id: {_eq: $g}}) { user_id channel external_address } }',
          { g: groupId },
        );
        return data.recipient_group_members
          .map((m) => `${m.user_id === null ? 'external' : 'user'}:${m.channel}:${m.external_address ?? ''}`)
          .sort();
      })
      .toEqual([`external:email:${address}`, 'user:in_app:']);
  });

  test('should create an escalation policy with a step that pages the group', async () => {
    await page.goto('/escalation-policies/create');
    await page.getByTestId('form-field-input:escalation_policy:create:name').fill(`${RUN} policy`);
    await page.getByTestId('form-submit:escalation_policy:create').click();
    await expect(page).toHaveURL(/\/escalation-policies\/[0-9a-f-]{36}$/);
    const policyId = page.url().split('/').pop() ?? '';
    sweep.push({
      name: 'delete the escalation policy',
      run: () => graphql('mutation ($id: uuid!) { delete_escalation_policies_by_pk(id: $id) { id } }', { id: policyId }),
    });

    await page.getByTestId('list-create:escalation_group_step').click();
    await page.getByTestId('form-field-input:escalation_group_step:create:step_no').fill('1');
    await page.getByTestId('form-field-input:escalation_group_step:create:after_minutes').fill('7');
    await pickRelation('form-field-input:escalation_group_step:create:recipient_group_id', groupName);
    await page.getByTestId('form-field-input:escalation_group_step:create:channel').click();
    await page.getByRole('option', { name: /^In-app\b/ }).click();
    await page.getByTestId('form-submit:escalation_group_step:create').click();
    await expect
      .poll(async () => {
        const data = await graphql<{ escalation_policy_steps: { step_no: number; after_minutes: number; recipient_group_id: string | null; channel: string }[] }>(
          'query ($p: uuid!) { escalation_policy_steps(where: {policy_id: {_eq: $p}}) { step_no after_minutes recipient_group_id channel } }',
          { p: policyId },
        );
        return data.escalation_policy_steps;
      })
      .toEqual([{ step_no: 1, after_minutes: 7, recipient_group_id: groupId, channel: 'in_app' }]);
  });

  test('should show who is on call now on a seeded schedule', async () => {
    const found = await graphql<{ on_call_schedules: { id: string; name: string; on_call_user_id: string | null }[] }>(
      '{ on_call_schedules(order_by: {name: asc}) { id name on_call_user_id } }',
    );
    const schedule = found.on_call_schedules.find((s) => s.on_call_user_id !== null);
    if (!schedule) throw new Error('the seed has no on-call schedule with somebody on call');
    await page.goto('/on-call-schedules');
    const cell = page.getByTestId(`list-cell:on_call_schedule:${schedule.id}:on_call_user_id`);
    await expect(cell).toBeVisible();
    // The list names the member the database computes for this moment.
    await expect(cell.locator(`[data-testid="relation-display:user:${schedule.on_call_user_id}"]`)).toBeVisible();
    await page.getByTestId(`list-row:on_call_schedule:${schedule.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/on-call-schedules/${schedule.id}$`));
    await expect(page.locator('[data-testid^="list-row:on_call_schedule_member:"]').first()).toBeVisible();
  });

  test('should create a personal subscription and switch it off', async () => {
    await page.goto('/my-subscriptions/create');
    await page.getByTestId('form-field-input:notification_subscription:create:event_type').click();
    await page.getByRole('option', { name: /^Unknown person\b/ }).click();
    await page.getByTestId('form-field-input:notification_subscription:create:channel').click();
    await page.getByRole('option', { name: /^In-app\b/ }).click();
    await page.getByTestId('form-submit:notification_subscription:create').click();
    await expect(page).toHaveURL(/\/my-subscriptions\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    // A subscription cannot be deleted from the console (it would take its deliveries along): the sweep does.
    sweep.push({
      name: 'delete the subscription',
      run: () => asAdmin('mutation ($id: uuid!) { delete_notification_subscriptions_by_pk(id: $id) { id } }', { id }),
    });
    const state = async (): Promise<{ user_id: string; event_type: string; is_active: boolean }> =>
      (
        await graphql<{ notification_subscriptions_by_pk: { user_id: string; event_type: string; is_active: boolean } }>(
          'query ($id: uuid!) { notification_subscriptions_by_pk(id: $id) { user_id event_type is_active } }',
          { id },
        )
      ).notification_subscriptions_by_pk;
    expect(await state()).toEqual({ user_id: me, event_type: 'detection_unknown', is_active: true });

    await page.goto(`/my-subscriptions/${id}/edit`);
    await page.getByTestId('form-field-input:notification_subscription:edit:is_active').click();
    await page.getByTestId('form-submit:notification_subscription:edit').click();
    await expect.poll(async () => (await state()).is_active).toBe(false);
  });

  test('should list only failed or retrying deliveries in the Failed view', async () => {
    // The seed has no failed delivery: the run adds one (an email that bounced) and removes it.
    const made = await asAdmin<{ insert_notification_deliveries_one: { id: string } }>(
      'mutation ($o: notification_deliveries_insert_input!) { insert_notification_deliveries_one(object: $o) { id } }',
      {
        o: {
          organization_id: organization,
          rule_id: ruleId,
          recipient_address: `${RUN}@example.com`,
          channel: 'email',
          status: 'failed',
          priority: 'low',
          error: `${RUN} mailbox unavailable`,
          content: { title: `${RUN} delivery` },
        },
      },
    );
    const failedId = made.insert_notification_deliveries_one.id;
    sweep.push({
      name: 'delete the failed delivery',
      run: () => asAdmin('mutation ($id: uuid!) { delete_notification_deliveries_by_pk(id: $id) { id } }', { id: failedId }),
    });
    const delivered = (
      await asAdmin<{ notification_deliveries: { id: string }[] }>('{ notification_deliveries(where: {status: {_eq: delivered}}, limit: 1) { id } }')
    ).notification_deliveries[0]?.id;
    await page.goto('/notification-deliveries');
    await expect(page.locator('[data-testid^="list-row:notification_delivery:"]').first()).toBeVisible();
    await page.getByTestId('list-saved-views:notification_delivery').click();
    await page.getByRole('button', { name: 'Failed', exact: true }).click();
    await expect(page.getByTestId(`list-row:notification_delivery:${failedId}`)).toBeVisible();
    if (delivered !== undefined) await expect(page.getByTestId(`list-row:notification_delivery:${delivered}`)).toHaveCount(0);
    const statuses = page.locator('[data-testid^="list-cell:notification_delivery:"][data-testid$=":status"]');
    await expect
      .poll(async () => {
        const texts = (await statuses.allTextContents()).map((text) => text.trim());
        return texts.length > 0 && texts.every((text) => text === 'Failed' || text === 'Retrying');
      })
      .toBe(true);
  });

  test('should show the unread count on the bell and mark a notification read in the inbox', async () => {
    const made = await asAdmin<{ insert_user_notifications_one: { id: string } }>(
      'mutation ($o: user_notifications_insert_input!) { insert_user_notifications_one(object: $o) { id } }',
      { o: { organization_id: organization, user_id: me, title: `${RUN} inbox`, priority: 'low' } },
    );
    const id = made.insert_user_notifications_one.id;
    sweep.push({
      name: 'delete the inbox notification',
      run: () => asAdmin('mutation ($id: uuid!) { delete_user_notifications_by_pk(id: $id) { id } }', { id }),
    });
    const unread = (): Promise<number> => count('user_notifications', `{user_id: {_eq: "${me}"}, read_at: {_is_null: true}}`);
    const before = await unread();
    expect(before).toBeGreaterThan(0);
    await page.goto('/inbox');
    const badge = page.getByTestId('inbox-bell:count');
    await expect(badge).toHaveText(before > 99 ? '99+' : String(before));
    await page.getByTestId('inbox-bell').click();
    await expect(page.getByTestId('inbox-bell:item').filter({ hasText: `${RUN} inbox` })).toBeVisible();
    await page.keyboard.press('Escape');

    const row = page.getByTestId(`list-row:user_notification:${id}`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Mark read', exact: true }).click();
    await expect.poll(unread).toBe(before - 1);
    await expect(badge).toHaveText(before - 1 > 99 ? '99+' : String(before - 1));
  });

  test('should warn about a private address, save a webhook with a secret and delete it', async () => {
    await page.goto('/webhooks/create');
    const url = page.getByTestId('form-field-input:webhook_subscription:create:url');
    // The address the sender reads as loopback, written as a number, is warned about like a dotted one.
    await url.fill('http://2130706433/hook');
    await url.blur();
    await expect(page.getByText(/loopback or private network address/i).first()).toBeVisible();
    await url.fill(`http://10.0.0.5:8080/${RUN}`);
    await url.blur();
    await expect(page.getByText(/loopback or private network address/i).first()).toBeVisible();
    await page.getByTestId('form-field-input:webhook_subscription:create:secret').fill('e2e-secret-0123456789');
    await page.getByTestId('form-field-input:webhook_subscription:create:description').fill(`${RUN} webhook`);
    // Off, so nothing is sent while the test runs.
    await page.getByTestId('form-field-input:webhook_subscription:create:is_active').click();
    await page.getByTestId('form-submit:webhook_subscription:create').click();
    await expect(page).toHaveURL(/\/webhooks\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    sweep.push({
      name: 'delete the webhook',
      run: () => asAdmin('mutation ($id: uuid!) { delete_webhook_subscriptions_by_pk(id: $id) { id } }', { id }),
    });
    const saved = (
      await graphql<{ webhook_subscriptions_by_pk: { url: string; is_active: boolean; description: string } }>(
        'query ($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { url is_active description } }',
        { id },
      )
    ).webhook_subscriptions_by_pk;
    expect(saved).toEqual({ url: `http://10.0.0.5:8080/${RUN}`, is_active: false, description: `${RUN} webhook` });
    // The secret is stored, and never readable.
    expect((await asAdmin<{ webhook_subscriptions_by_pk: { secret: string } }>('query ($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { secret } }', { id }))
      .webhook_subscriptions_by_pk.secret.length).toBeGreaterThanOrEqual(16);
    await expect(page.getByText('e2e-secret-0123456789')).toHaveCount(0);

    await page.goto('/webhooks');
    const row = page.getByRole('row', { name: new RegExp(RUN) });
    await row.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await dialogs().getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => count('webhook_subscriptions', `{id: {_eq: "${id}"}}`)).toBe(0);
  });
});
