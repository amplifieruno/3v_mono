import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { defaultEventHandlers } from '../events/router.js';
import {
  createEvaluateSegmentsHourly,
  createEvaluateSegmentsPending,
  evaluateSegmentsHourly,
  evaluateSegmentsPending,
  failureText,
  type Evaluate,
  type OrganizationClients,
} from './crons.js';
import { SegmentError, type EvaluateResult } from './evaluate.js';

const AT = '2026-10-19T10:00:00.000Z';
const payload = (name: string) => ({ id: 'run-1', name, scheduled_time: '2026-10-19T10:00:00Z', payload: {} });
const clients: OrganizationClients = { reader: { request: vi.fn() }, writer: { request: vi.fn() } };
const clientsFor = vi.fn(() => clients);
const ok = (segment_id: string): EvaluateResult => ({
  segment_id,
  added: 0,
  removed: 0,
  member_count: 0,
  evaluated_at: AT,
  stale: false,
});

type Call = { op: string; vars: Record<string, unknown> | undefined };

/** Fake admin client: answers by GraphQL operation name, records every call. */
function fakeAdmin(answers: Record<string, unknown | ((vars?: Record<string, unknown>) => unknown)>) {
  const calls: Call[] = [];
  const admin: HasuraClient = {
    request: async <T>(query: string, vars?: Record<string, unknown>): Promise<T> => {
      const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '?';
      calls.push({ op, vars });
      const answer = answers[op];
      return (typeof answer === 'function' ? answer(vars) : (answer ?? {})) as T;
    },
  };
  return { admin, calls };
}

const run = (handler: ReturnType<typeof createEvaluateSegmentsHourly>, name: string, admin: HasuraClient) =>
  handler.handle(payload(name), { env: {} as Env, admin, idempotencyKey: 'k' });

describe('segment evaluation crons', () => {
  it('should be registered under their trigger names', () => {
    expect(defaultEventHandlers.evaluate_segments_pending).toBe(evaluateSegmentsPending);
    expect(defaultEventHandlers.evaluate_segments).toBe(evaluateSegmentsHourly);
  });

  it('should record a failing segment and keep evaluating the others (hourly order: stats, segments, daily)', async () => {
    const { admin, calls } = fakeAdmin({
      SegmentCronOrganizations: { organizations: [{ id: 'org-1' }] },
      SegmentsToEvaluate: { segments: [{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }, { id: 's-gone' }] },
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => {
      if (id === 's-2') throw new HasuraError('constraint-violation', 'segment_condition_invalid:$.field');
      if (id === 's-gone') throw new SegmentError('segment_not_found');
      return ok(id);
    });
    const result = await run(createEvaluateSegmentsHourly({ clientsFor, evaluate, now: () => Date.parse(AT) - 5000 }), 'evaluate_segments', admin);
    expect(result).toEqual({ organizations: 1, segments: 4, failed: 1 });
    expect(evaluate.mock.calls.map(([, id, at]) => [id, at])).toEqual([
      ['s-1', AT],
      ['s-2', AT],
      ['s-3', AT],
      ['s-gone', AT],
    ]);
    expect(clientsFor).toHaveBeenCalledWith({}, 'org-1');
    expect(calls.map((c) => c.op)).toEqual([
      'SegmentCronOrganizations',
      'RunActivityStats',
      'SegmentsToEvaluate',
      'RecordSegmentEvaluationFailure',
      'RefreshSegmentDailyStats',
    ]);
    expect(calls[3].vars).toEqual({ id: 's-2', error: 'segment_condition_invalid:$.field', at: AT });
    expect(calls[1].vars).toEqual({ organization: 'org-1', at: AT });
  });

  it('should attempt every organization and fail the run when one failed', async () => {
    const { admin, calls } = fakeAdmin({
      SegmentCronOrganizations: { organizations: [{ id: 'org-1' }, { id: 'org-2' }] },
      RunActivityStats: (vars?: Record<string, unknown>) => {
        if (vars?.organization === 'org-1') throw new Error('down');
        return {};
      },
      SegmentsToEvaluate: { segments: [] },
    });
    const handler = createEvaluateSegmentsHourly({ clientsFor, evaluate: vi.fn<Evaluate>(), now: () => Date.parse(AT) });
    await expect(run(handler, 'evaluate_segments', admin)).rejects.toThrow(/failed for 1 of 2 organizations/);
    expect(calls.filter((c) => c.op === 'RefreshSegmentDailyStats').map((c) => c.vars?.organization)).toEqual(['org-2']);
  });

  it('should evaluate segments of a late hourly run at the current time, activity stats at the scheduled time', async () => {
    const { admin, calls } = fakeAdmin({
      SegmentCronOrganizations: { organizations: [{ id: 'org-1' }] },
      SegmentsToEvaluate: { segments: [{ id: 's-1' }, { id: 's-2' }] },
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => {
      if (id === 's-2') throw new SegmentError('segment_condition_invalid', '$.field');
      return ok(id);
    });
    const later = new Date(Date.parse(AT) + 90_000).toISOString();
    await run(createEvaluateSegmentsHourly({ clientsFor, evaluate, now: () => Date.parse(later) }), 'evaluate_segments', admin);
    expect(evaluate.mock.calls.map(([, , at]) => at)).toEqual([later, later]);
    expect(calls.find((c) => c.op === 'RecordSegmentEvaluationFailure')?.vars?.at).toBe(later);
    expect(calls.find((c) => c.op === 'RunActivityStats')?.vars).toEqual({ organization: 'org-1', at: AT });
    // Late by more than a minute: the scheduled time first (finishes the days it covered), then the evaluation time
    // (today's row matches the rows just written).
    expect(calls.filter((c) => c.op === 'RefreshSegmentDailyStats').map((c) => c.vars)).toEqual([
      { organization: 'org-1', at: AT },
      { organization: 'org-1', at: later },
    ]);
  });

  it('should refresh daily stats once, at the evaluation time, for a run on time', async () => {
    const { admin, calls } = fakeAdmin({
      SegmentCronOrganizations: { organizations: [{ id: 'org-1' }] },
      SegmentsToEvaluate: { segments: [{ id: 's-1' }] },
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => ok(id));
    const soon = new Date(Date.parse(AT) + 5000).toISOString();
    await run(createEvaluateSegmentsHourly({ clientsFor, evaluate, now: () => Date.parse(soon) }), 'evaluate_segments', admin);
    expect(evaluate.mock.calls.map(([, , at]) => at)).toEqual([soon]);
    expect(calls.filter((c) => c.op === 'RefreshSegmentDailyStats').map((c) => c.vars)).toEqual([{ organization: 'org-1', at: soon }]);
  });

  it('should evaluate due organizations and finish each request with the requested_at it read', async () => {
    const { admin, calls } = fakeAdmin({
      DueSegmentEvaluations: {
        due_segment_evaluations: [
          { organization_id: 'org-1', requested_at: '2026-10-19T09:59:00.123456+00:00' },
          { organization_id: 'org-2', requested_at: '2026-10-19T09:59:10+00:00' },
        ],
      },
      SegmentsToEvaluate: (vars?: Record<string, unknown>) => ({
        segments: vars?.organization === 'org-1' ? [{ id: 's-1' }] : [],
      }),
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => ok(id));
    const now = () => Date.parse(AT) - 5000;
    const result = await run(createEvaluateSegmentsPending({ clientsFor, evaluate, now }), 'evaluate_segments_pending', admin);
    expect(result).toEqual({ organizations: 2, segments: 1, failed: 0, pending: 0 });
    expect(evaluate.mock.calls.map(([, , at]) => at)).toEqual([AT]);
    expect(calls[0]).toEqual({ op: 'DueSegmentEvaluations', vars: { at: AT } });
    expect(calls.filter((c) => c.op === 'FinishSegmentEvaluationRequest').map((c) => c.vars)).toEqual([
      { organization: 'org-1', requested: '2026-10-19T09:59:00.123456+00:00' },
      { organization: 'org-2', requested: '2026-10-19T09:59:10+00:00' },
    ]);
  });

  it('should evaluate a late run at the current time, not at its scheduled time', async () => {
    const { admin, calls } = fakeAdmin({
      DueSegmentEvaluations: { due_segment_evaluations: [{ organization_id: 'org-1', requested_at: AT }] },
      SegmentsToEvaluate: { segments: [{ id: 's-1' }] },
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => ok(id));
    const later = Date.parse(AT) + 90_000;
    await run(createEvaluateSegmentsPending({ clientsFor, evaluate, now: () => later }), 'evaluate_segments_pending', admin);
    expect(calls[0].vars).toEqual({ at: AT });
    expect(evaluate.mock.calls[0][2]).toBe(new Date(later).toISOString());
  });

  it('should not finish a request after a stale sync or a transient failure, but after a condition failure', async () => {
    const due = (org: string) => ({ organization_id: org, requested_at: AT });
    const { admin, calls } = fakeAdmin({
      DueSegmentEvaluations: { due_segment_evaluations: [due('org-stale'), due('org-down'), due('org-bad')] },
      SegmentsToEvaluate: (vars?: Record<string, unknown>) => ({ segments: [{ id: `s-${String(vars?.organization)}` }] }),
    });
    const evaluate = vi.fn<Evaluate>(async (_c, id) => {
      if (id === 's-org-stale') return { ...ok(id), stale: true };
      if (id === 's-org-down') throw new HasuraError('timeout', 'Hasura request timed out');
      throw new HasuraError('constraint-violation', 'segment_condition_invalid:$.field');
    });
    const handler = createEvaluateSegmentsPending({ clientsFor, evaluate, now: () => Date.parse(AT) });
    const result = await run(handler, 'evaluate_segments_pending', admin);
    expect(result).toEqual({ organizations: 3, segments: 3, failed: 2, pending: 2 });
    expect(calls.filter((c) => c.op === 'FinishSegmentEvaluationRequest').map((c) => c.vars?.organization)).toEqual(['org-bad']);
    expect(calls.filter((c) => c.op === 'RecordSegmentEvaluationFailure').map((c) => c.vars?.id)).toEqual([
      's-org-down',
      's-org-bad',
    ]);
  });

  it('should leave an organization pending when its evaluation could not run', async () => {
    const { admin, calls } = fakeAdmin({
      DueSegmentEvaluations: { due_segment_evaluations: [{ organization_id: 'org-1', requested_at: AT }] },
      SegmentsToEvaluate: () => {
        throw new Error('hasura down');
      },
    });
    const handler = createEvaluateSegmentsPending({ clientsFor, evaluate: vi.fn<Evaluate>() });
    await expect(run(handler, 'evaluate_segments_pending', admin)).rejects.toThrow(/failed for 1 of 1/);
    expect(calls.some((c) => c.op === 'FinishSegmentEvaluationRequest')).toBe(false);
  });

  it('should reject an invalid scheduled_time', async () => {
    const { admin } = fakeAdmin({});
    await expect(
      evaluateSegmentsPending.handle({ ...payload('evaluate_segments_pending'), scheduled_time: 'nope' }, {
        env: {} as Env,
        admin,
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow(/Invalid scheduled_time/);
  });

  it('should store the segment code or a bounded message as the failure', () => {
    expect(failureText(new SegmentError('segment_condition_invalid', 'segment_condition_invalid:$.value'))).toBe(
      'segment_condition_invalid:$.value',
    );
    expect(failureText(new Error('x'.repeat(5000)))).toHaveLength(1000);
    expect(failureText('weird')).toBe('weird');
  });
});
