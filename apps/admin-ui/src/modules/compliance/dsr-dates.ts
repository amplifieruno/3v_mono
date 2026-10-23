import type { CheckDI, FlowCheck } from '@burojs/core';

/**
 * The dates of a data subject request, as `itap.data_subject_requests` rules them
 * (`data_subject_requests_due_window`, `data_subject_requests_guard`): the request is due 30 days
 * after it was received (GDPR Art. 12(3)) unless a later date is set, at most 90 days after
 * receipt (the extension of Art. 12(3)); it cannot be received in the future (5 minutes of clock
 * skew allowed). Mirrored here so the form says it before sending; the database decides.
 */
export const DSR_DEFAULT_DUE_DAYS = 30;
export const DSR_MAX_DUE_DAYS = 90;
const DAY_MS = 86_400_000;
const SKEW_MS = 5 * 60_000;

const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** The default due date: received + 30 days (ISO). */
export function defaultDueAt(receivedAt: string): string {
  const received = instant(receivedAt) ?? Date.now();
  return new Date(received + DSR_DEFAULT_DUE_DAYS * DAY_MS).toISOString();
}

/** The latest due date allowed: received + 90 days (ISO). */
export function latestDueAt(receivedAt: string): string {
  const received = instant(receivedAt) ?? Date.now();
  return new Date(received + DSR_MAX_DUE_DAYS * DAY_MS).toISOString();
}

export type DueProblem = 'not-after-received' | 'too-late' | null;

/** What is wrong with a chosen due date (`null`: fine, or none chosen: the default applies). */
export function dueProblem(receivedAt: unknown, dueAt: unknown): DueProblem {
  const received = instant(receivedAt);
  const due = instant(dueAt);
  if (received === null || due === null) return null;
  if (due <= received) return 'not-after-received';
  if (due > received + DSR_MAX_DUE_DAYS * DAY_MS) return 'too-late';
  return null;
}

/** Whether the receipt lies in the future (beyond the clock skew the database allows). */
export function receivedInFuture(receivedAt: unknown, now = Date.now()): boolean {
  const received = instant(receivedAt);
  return received !== null && received > now + SKEW_MS;
}

/** The receipt and due date a new request is sent with: the due date filled with the default when left empty. */
export function requestDates(values: { readonly received_at?: unknown; readonly due_at?: unknown }): { received_at: string; due_at: string } {
  const received = instant(values.received_at);
  const receivedAt = new Date(received ?? Date.now()).toISOString();
  const due = instant(values.due_at);
  return { received_at: receivedAt, due_at: due === null ? defaultDueAt(receivedAt) : new Date(due).toISOString() };
}

const fires =
  (test: (values: Readonly<Record<string, unknown>>) => boolean) =>
  ({ values }: CheckDI): boolean =>
    test(values as Readonly<Record<string, unknown>>);

/** The date checks of every "new request" flow (errors: the database refuses each). */
export const DSR_DATE_CHECKS: FlowCheck[] = [
  {
    id: 'dsrReceivedInFuture',
    severity: 'error',
    anchor: 'received_at',
    when: fires((v) => receivedInFuture(v.received_at)),
    texts: 'A request cannot be received in the future: use the moment it reached the organization.',
  },
  {
    id: 'dsrDueNotAfterReceived',
    severity: 'error',
    anchor: 'due_at',
    when: fires((v) => dueProblem(v.received_at, v.due_at) === 'not-after-received'),
    texts: 'The due date must be after the request was received.',
  },
  {
    id: 'dsrDueTooLate',
    severity: 'error',
    anchor: 'due_at',
    when: fires((v) => dueProblem(v.received_at, v.due_at) === 'too-late'),
    texts: 'A request is due at most 90 days after it was received (30 days, extended by at most two further months).',
  },
];
