import type { AuthMode } from './authAppsPlan.js';
import type { Random } from './random.js';

/**
 * Capture steps of a seeded authentication session per scenario (pure data; see authPlan.ts).
 * probe: what the capture shows — `match` the subject (clearly above the threshold), `partial` the subject just
 * below it (inside the partial band), `impostor` another population member than the claimed one, `outsider` a person
 * outside the population, null = no usable face (quality failure). attack: the sequence check outcome the service
 * would have sent — `replay` reuses the digest of an earlier session (the engine turns it into injection),
 * `liveness_unavailable` = not_checked although the frames were usable (liveness_failed on liveness apps).
 */
export type QualityReason = 'no_face' | 'multiple_faces' | 'low_quality' | 'blur' | 'poor_lighting';
export const QUALITY_REASONS: QualityReason[] = ['no_face', 'multiple_faces', 'low_quality', 'blur', 'poor_lighting'];
export type Probe = 'match' | 'partial' | 'impostor' | 'outsider';
export type AttackPlan = 'passed' | 'not_checked' | 'liveness_unavailable' | 'printed_photo' | 'injection' | 'replay';

export type DecideStep = {
  kind: 'decide';
  offsetMs: number;
  probe: Probe | null;
  quality: QualityReason | null;
  attack: AttackPlan;
  /** Keep an evidence frame (auth_capture) for this capture. */
  evidence: boolean;
};
export type SecondFactorStep = { kind: 'second_factor'; offsetMs: number; passed: boolean; method: string };
export type PlanStep = DecideStep | SecondFactorStep;

type Capture = [Probe | null, AttackPlan] | 'quality';

const CAPTURES: Record<string, Capture[]> = {
  success: [['match', 'passed']],
  partial_then_success: [['partial', 'passed'], ['match', 'passed']],
  quality_then_success: ['quality', ['match', 'passed']],
  quality_exhausted: ['quality', 'quality', 'quality'],
  outsider: [['outsider', 'passed']],
  liveness_failed: [['match', 'liveness_unavailable']],
  printed_photo: [['match', 'printed_photo']],
  injection: [['match', 'injection']],
  replay: [['match', 'replay']],
  review: [['partial', 'passed'], ['partial', 'passed'], ['partial', 'passed']],
  second_factor_passed: [['partial', 'passed']],
  second_factor_failed: [['partial', 'passed'], ['partial', 'passed']],
  impostor: [['impostor', 'passed']],
  not_in_population: [['outsider', 'passed']],
  not_retrieved: [['match', 'passed']],
};

/** Steps of one session; `quality` is the failure reason of its quality-failed captures. */
export function decideSteps(scenario: string, mode: AuthMode, rng: Random, quality: QualityReason = 'blur'): PlanStep[] {
  const captures = CAPTURES[scenario];
  if (!captures) throw new Error(`seed: unknown auth scenario ${scenario}`);
  const steps: PlanStep[] = [];
  let offset = rng.int(2_000, 5_000);
  for (const c of captures) {
    const [probe, attack]: [Probe | null, AttackPlan] = c === 'quality' ? [null, 'not_checked'] : c;
    steps.push({ kind: 'decide', offsetMs: offset, probe, quality: c === 'quality' ? quality : null, attack, evidence: false });
    offset += rng.int(8_000, 25_000);
  }
  if (mode === 'verification' && scenario.startsWith('second_factor_')) {
    steps.push({
      kind: 'second_factor',
      offsetMs: offset + rng.int(20_000, 50_000),
      passed: scenario === 'second_factor_passed',
      method: rng.pick(['otp', 'badge_pin', 'sms_code']),
    });
  }
  return steps;
}
