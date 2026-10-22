import type { ReportProgress } from '../../modules/analytics/report-ops';

/** Attempts a report gets per (re)try before it fails with `max_attempts` (`itap.report_max_attempts`). */
export const REPORT_MAX_ATTEMPTS = 3;

/** Statuses the report still moves on from by itself. */
export const PENDING_STATUSES: ReadonlySet<string> = new Set(['queued', 'generating']);

export type StepState = 'done' | 'current' | 'todo' | 'failed';

export interface ReportStep {
  readonly key: 'requested' | 'generating' | 'completed' | 'failed' | 'expired';
  readonly state: StepState;
  /** When it happened (ISO), when known. */
  readonly at: string | null;
  /** The attempt of a generation step, counted since the last retry. */
  readonly attempt: number | null;
}

/**
 * The steps of a report's progress: requested → generating → completed, or → failed (with the
 * error) or expired. A failed report retried is queued again: the steps restart from "generating".
 */
export function reportSteps(progress: ReportProgress): ReportStep[] {
  const attempt = Math.max(0, progress.attempts - progress.attempts_at_retry);
  const requested: ReportStep = { key: 'requested', state: 'done', at: progress.created_at, attempt: null };
  const generating = (state: StepState): ReportStep => ({ key: 'generating', state, at: null, attempt: attempt === 0 ? null : attempt });
  switch (progress.status) {
    case 'queued':
      return [requested, generating('todo'), { key: 'completed', state: 'todo', at: null, attempt: null }];
    case 'generating':
      return [requested, generating('current'), { key: 'completed', state: 'todo', at: null, attempt: null }];
    case 'completed':
      return [requested, generating('done'), { key: 'completed', state: 'done', at: progress.generated_at, attempt: null }];
    case 'failed':
      return [requested, generating('done'), { key: 'failed', state: 'failed', at: progress.updated_at, attempt: null }];
    default:
      return [
        requested,
        generating('done'),
        { key: progress.generated_at === null ? 'failed' : 'completed', state: 'done', at: progress.generated_at, attempt: null },
        { key: 'expired', state: 'done', at: progress.updated_at, attempt: null },
      ];
  }
}
