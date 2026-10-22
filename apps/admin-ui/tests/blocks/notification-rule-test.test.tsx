// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { notificationRuleTestBlock } from '../../src/blocks/notification-rule-test/notification-rule-test-block';
import { type TestRow, testSummary } from '../../src/blocks/notification-rule-test/notification-rule-test-query';
import { notificationRuleTestView } from '../../src/blocks/notification-rule-test/views';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * "Test rule" (Review Focus 1): the rule tried against the latest events with
 * `test_notification_rule` shows which events would match and to whom (members by name,
 * external addresses as they are, each with the channel), why the others do not, and sends
 * nothing: the block issues queries only, never a mutation.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const RULE = '99999999-9999-4999-8999-000000000001';
const ANNA = '22222222-2222-4222-8222-000000000001';
const id = (n: number): string => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`;

const row = (n: number, reason: string, recipients: TestRow['recipients'] = []): TestRow => ({
  event_id: id(n),
  event_type: reason === 'event_type_mismatch' ? 'device_offline' : 'blacklist_match',
  severity: 'critical',
  occurred_at: '2026-10-22T09:05:00Z',
  title: `Event ${n}`,
  would_match: reason === 'match',
  reason,
  recipient_count: recipients.length,
  recipients,
});

const ROWS: TestRow[] = [
  row(1, 'match', [
    { channel: 'email', user_id: null, address: 'guard@example.com' },
    { channel: 'in_app', user_id: ANNA, address: null },
  ]),
  row(2, 'condition_mismatch'),
  row(3, 'event_type_mismatch'),
  row(4, 'match', [{ channel: 'in_app', user_id: ANNA, address: null }]),
];

let answer: unknown = { data: { test_notification_rule: ROWS } };

const bodies = (): string[] => vi.mocked(fetch).mock.calls.map(([, init]) => String(init?.body ?? ''));

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}

const MESSAGES = Object.fromEntries(
  Object.entries(notificationRuleTestBlock.texts as Record<string, unknown>).filter(([, value]) => typeof value === 'string'),
) as Record<string, string>;

const render = (ruleId: string | null) =>
  renderBlock(notificationRuleTestView, { props: { ruleId }, wrapper: Wrapper, messages: MESSAGES });

beforeAll(installDomShims);

beforeEach(() => {
  answer = { data: { test_notification_rule: ROWS } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      if (body.includes('test_notification_rule')) return hasuraResponse(answer);
      if (body.includes('NotificationUserNames')) return hasuraResponse({ data: { users: [{ id: ANNA, displayName: 'Anna Berg' }] } });
      return hasuraResponse({ data: {} });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('test summary', () => {
  it('should count matches, notifications and distinct recipients', () => {
    expect(testSummary(ROWS)).toEqual({ events: 4, matched: 2, notifications: 3, recipients: 2 });
  });
});

describe('the rule test block (Review Focus 1)', () => {
  it('should show which events would match and to whom, without sending anything', async () => {
    await render(RULE);
    const summary = await screen.findByTestId('rule-test-summary');
    expect(summary.textContent).toBe('2 of the latest 4 events would match: 3 notifications to 2 recipients.');

    const rows = screen.getAllByTestId('rule-test-row');
    expect(rows.map((r) => r.getAttribute('data-reason'))).toEqual(['match', 'condition_mismatch', 'event_type_mismatch', 'match']);
    expect(rows[1]?.textContent).toContain('Conditions not met');
    expect(rows[2]?.textContent).toContain('Other event type');
    const first = within(rows[0] as HTMLElement).getByTestId('test-recipients');
    await waitFor(() => expect(first.textContent).toContain('Anna Berg'));
    expect(first.textContent).toContain('guard@example.com');
    expect(first.textContent).toContain('Email');
    expect(first.textContent).toContain('In-app');
    expect(within(rows[1] as HTMLElement).queryByTestId('test-recipients')).toBeNull();

    const test = bodies().find((body) => body.includes('test_notification_rule'));
    expect(JSON.parse(String(test)).variables).toEqual({ rule: RULE, limit: 20 });
    // A dry run: only queries went out.
    expect(bodies().every((body) => !/"query":"\s*mutation/.test(body))).toBe(true);
  });

  it('should say when nothing would match', async () => {
    answer = { data: { test_notification_rule: [row(2, 'condition_mismatch')] } };
    await render(RULE);
    expect((await screen.findByTestId('rule-test-summary')).textContent).toBe('None of the latest 1 events would match.');
  });

  it('should say when a match would notify nobody', async () => {
    answer = { data: { test_notification_rule: [row(1, 'match')] } };
    await render(RULE);
    expect(await screen.findByText(MESSAGES.noRecipients ?? '')).toBeDefined();
    expect(screen.getByTestId('rule-test-row').textContent).toContain('Nobody');
  });

  it('should say when the rule no longer exists', async () => {
    answer = { errors: [{ message: 'notification_rule_not_found', extensions: { code: 'notification_rule_not_found' } }] };
    await render(RULE);
    expect(await screen.findByText('The rule no longer exists.')).toBeDefined();
  });

  it('should read nothing without a rule', async () => {
    await render(null);
    await waitFor(() => expect(bodies().filter((body) => body.includes('test_notification_rule'))).toHaveLength(0));
  });
});
