// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { deliveryReportBlock } from '../../src/blocks/delivery-report/delivery-report-block';
import { type ReportRow, factsOf, formatSeconds, periodBounds } from '../../src/blocks/delivery-report/delivery-report-query';
import { deliveryReportView } from '../../src/blocks/delivery-report/views';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The delivery report (`delivery_report`): the headline figures over every channel and a row per
 * channel for the period, read up to now; failures stand out; the period reaches the function as
 * `[from, to)`.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

const zero = { pending: 0, sent: 0, delivered: 0, failed: 0, dead_letter: 0, digested: 0, acknowledged: 0, escalations: 0 };
const ROWS: ReportRow[] = [
  { ...zero, channel: 'email', total: 12, sent: 8, dead_letter: 3, failed: 1, digested: 9, ack_rate: null, avg_response_seconds: null },
  { ...zero, channel: 'in_app', total: 40, delivered: 40, acknowledged: 30, escalations: 6, ack_rate: 0.75, avg_response_seconds: 312.5 },
  { ...zero, channel: 'push', total: 0, ack_rate: null, avg_response_seconds: null },
  { ...zero, channel: 'sms', total: 5, delivered: 4, pending: 1, escalations: 5, ack_rate: null, avg_response_seconds: null },
];

let answer: unknown = { data: { delivery_report: ROWS } };
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
  Object.entries(deliveryReportBlock.texts as Record<string, unknown>).filter(([, value]) => typeof value === 'string'),
) as Record<string, string>;

beforeAll(installDomShims);

beforeEach(() => {
  answer = { data: { delivery_report: ROWS } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      String(init?.body ?? '').includes('delivery_report') ? hasuraResponse(answer) : hasuraResponse({ data: {} }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('delivery report figures', () => {
  it('should sum the channels and take the response figures from in-app', () => {
    expect(factsOf(ROWS)).toEqual({
      total: 57,
      delivered: 44,
      waiting: 1,
      failed: 1,
      dead_letter: 3,
      ack_rate: '75%',
      avg_response: '5 min 13 s',
      escalations: 11,
    });
  });

  it('should leave the response figures empty without in-app deliveries', () => {
    const facts = factsOf(ROWS.filter((row) => row.channel !== 'in_app'));
    expect(facts.ack_rate).toBeNull();
    expect(facts.avg_response).toBeNull();
  });

  it('should write seconds, minutes and hours', () => {
    expect(formatSeconds(12.4)).toBe('12 s');
    expect(formatSeconds(312.5)).toBe('5 min 13 s');
    expect(formatSeconds(7500)).toBe('2 h 5 min');
  });

  it('should end every period now', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(periodBounds('24h', now)).toEqual({ from: '2026-10-21T12:00:00.000Z', to: '2026-10-22T12:00:00.000Z' });
    expect(periodBounds('7d', now).from).toBe('2026-10-15T12:00:00.000Z');
    expect(periodBounds('30d', now).from).toBe('2026-09-22T12:00:00.000Z');
  });
});

describe('the delivery report block', () => {
  it('should show a row per channel with problems standing out', async () => {
    await renderBlock(deliveryReportView, { props: { period: '7d' }, wrapper: Wrapper, messages: MESSAGES });
    const rows = await screen.findAllByTestId('delivery-report-row');
    expect(rows.map((row) => row.getAttribute('data-channel'))).toEqual(['email', 'in_app', 'push', 'sms']);
    const email = rows[0] as HTMLElement;
    const deadLetters = email.querySelector('[data-column="dead_letter"]');
    expect(deadLetters?.textContent).toBe('3');
    expect(deadLetters?.className).toContain('text-destructive');
    expect(email.querySelector('[data-column="digested"]')?.textContent).toBe('9');
    expect(rows[1]?.textContent).toContain('75%');
    expect(rows[1]?.textContent).toContain('5 min 13 s');
    expect(rows[2]?.className).toContain('text-muted-foreground');

    const sent = bodies().find((body) => body.includes('delivery_report'));
    const { from, to } = JSON.parse(String(sent)).variables as { from: string; to: string };
    expect(Date.parse(to) - Date.parse(from)).toBe(7 * 24 * 3_600_000);
  });

  it('should say when the report cannot be read', async () => {
    answer = { errors: [{ message: 'report_period_invalid', extensions: { code: 'report_period_invalid' } }] };
    await renderBlock(deliveryReportView, { props: { period: '24h' }, wrapper: Wrapper, messages: MESSAGES });
    expect(await screen.findByText('The report could not be read.')).toBeDefined();
  });
});
