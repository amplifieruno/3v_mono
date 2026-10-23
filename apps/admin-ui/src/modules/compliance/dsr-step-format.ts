import type { DsrStep } from './dsr-steps-query';

/** The steps `dsr_steps.step` takes (written by the job and the closing functions). */
export const KNOWN_STEPS = [
  'claimed',
  'failed',
  'gave_up',
  'requeued',
  'restricted',
  'awaiting_rectification',
  'export_uploaded',
  'purged',
  'biometrics_deleted',
  'integration_suppressed',
  'profile_anonymized',
  'files_queued',
  'retained',
  'overdue',
  'rejected',
  'completed',
] as const;

export type StepTone = 'done' | 'warning' | 'failed' | 'info';

export interface StepLine {
  /** The block text key of the step's sentence (`step_<step>`, or `step_other`). */
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly tone: StepTone;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' && value !== '' ? value : fallback);

/** The sentence of one step: its text key, the values it names and how it reads (failed, warning, done). */
export function stepLine(step: DsrStep): StepLine {
  const d = step.details;
  switch (step.step) {
    case 'claimed':
      return { key: 'step_claimed', params: { attempt: num(d.attempt) }, tone: 'info' };
    case 'failed':
      return { key: 'step_failed', params: { attempt: num(d.attempt), error: str(d.error, 'unknown_error') }, tone: 'failed' };
    case 'gave_up':
      return { key: 'step_gave_up', params: { attempts: num(d.attempts) }, tone: 'failed' };
    case 'purged': {
      const held = num(d.held);
      return {
        key: held > 0 ? 'step_purged_held' : 'step_purged',
        params: { dataClass: str(d.class), affected: num(d.affected), held, files: num(d.files_enqueued) },
        tone: held > 0 ? 'warning' : 'done',
      };
    }
    case 'biometrics_deleted':
      return { key: 'step_biometrics_deleted', params: { deleted: num(d.identities_deleted), kept: num(d.identities_kept) }, tone: 'done' };
    case 'files_queued':
      return { key: 'step_files_queued', params: { files: num(d.files) }, tone: 'done' };
    case 'export_uploaded':
      return { key: 'step_export_uploaded', params: { files: num(d.files), missing: num(d.missing_files) }, tone: 'done' };
    case 'retained':
      return { key: 'step_retained', params: {}, tone: 'warning' };
    case 'rejected':
      return { key: d.reason === undefined ? 'step_rejected' : 'step_rejected_reason', params: { reason: str(d.reason) }, tone: 'failed' };
    case 'completed':
      return { key: d.partial === true ? 'step_completed_partial' : 'step_completed', params: {}, tone: d.partial === true ? 'warning' : 'done' };
    case 'overdue':
      return { key: 'step_overdue', params: {}, tone: 'warning' };
    default:
      return (KNOWN_STEPS as readonly string[]).includes(step.step)
        ? { key: `step_${step.step}`, params: {}, tone: 'done' }
        : { key: 'step_other', params: { step: step.step }, tone: 'info' };
  }
}
