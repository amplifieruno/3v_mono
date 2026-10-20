import { SEGMENT_NAMES } from './segmentPlan.js';

/**
 * Face authentication client applications of Nova Tower (slice 9, design §9): pure data, written by authApps.ts.
 * Thresholds: with the seeded populations (<= 100 identities) the population floor is 0.50, so the effective
 * identification threshold is the app threshold; verification uses max(app threshold, 0.55).
 */
export type AuthAppKey = 'lobby' | 'hr' | 'visitor' | 'sandbox' | 'legacy';
export type AuthMode = 'identification' | 'verification';
export type AuthAttribute = 'display_name' | 'photo' | 'profile_type' | 'company' | 'department' | 'employee_id' | 'access_level' | 'segments';

export type AuthAppSpec = {
  key: AuthAppKey;
  name: string;
  description: string;
  platform: 'web' | 'android' | 'ios' | 'server' | 'kiosk';
  status: 'active' | 'suspended';
  threshold: number;
  thresholdMin: number;
  thresholdMax: number;
  livenessRequired: boolean;
  useWorkSchedules: boolean;
  isSandbox: boolean;
  modes: AuthMode[];
  attributes: AuthAttribute[];
  /** Bound segments (by name). */
  segments: string[];
  /** Bound access points (by name). */
  accessPoints: string[];
  /** Gets a current key through the rotate path, a back-dated history key (revoked today) and history attempts. */
  keyed: boolean;
};

const TURNSTILES = ['Turnstile 1', 'Turnstile 2', 'Turnstile 3', 'Turnstile 4'];

export const AUTH_APPS: Record<AuthAppKey, AuthAppSpec> = {
  lobby: {
    key: 'lobby', name: 'Lobby Kiosk', description: 'Face check-in kiosks at the lobby turnstiles (employees on shift)',
    platform: 'kiosk', status: 'active', threshold: 0.6, thresholdMin: 0.5, thresholdMax: 0.9, livenessRequired: true,
    useWorkSchedules: true, isSandbox: false, modes: ['identification'], attributes: ['display_name', 'company', 'photo'],
    segments: [SEGMENT_NAMES.employees], accessPoints: TURNSTILES, keyed: true,
  },
  hr: {
    key: 'hr', name: 'HR Portal', description: 'Self-service HR portal: face verification of the signed-in employee',
    platform: 'web', status: 'active', threshold: 0.65, thresholdMin: 0.55, thresholdMax: 0.95, livenessRequired: false,
    useWorkSchedules: false, isSandbox: false, modes: ['verification'], attributes: ['display_name', 'employee_id', 'department'],
    segments: [SEGMENT_NAMES.employees], accessPoints: [], keyed: true,
  },
  visitor: {
    key: 'visitor', name: 'Visitor Check-in', description: 'Reception tablet: returning visitors check in by face',
    platform: 'ios', status: 'active', threshold: 0.6, thresholdMin: 0.5, thresholdMax: 0.9, livenessRequired: true,
    useWorkSchedules: false, isSandbox: false, modes: ['identification'], attributes: ['display_name', 'profile_type', 'photo'],
    segments: [SEGMENT_NAMES.visitors], accessPoints: ['Reception Desk'], keyed: true,
  },
  sandbox: {
    key: 'sandbox', name: 'Developer Sandbox', description: 'Integration sandbox on synthetic identities (no production data)',
    platform: 'server', status: 'active', threshold: 0.55, thresholdMin: 0.5, thresholdMax: 0.9, livenessRequired: false,
    useWorkSchedules: false, isSandbox: true, modes: ['identification', 'verification'], attributes: ['display_name', 'segments'],
    segments: [SEGMENT_NAMES.sandbox], accessPoints: [], keyed: true,
  },
  legacy: {
    key: 'legacy', name: 'Legacy Badge Kiosk', description: 'Old badge-and-face kiosk, suspended after the turnstile upgrade',
    platform: 'kiosk', status: 'suspended', threshold: 0.6, thresholdMin: 0.5, thresholdMax: 0.9, livenessRequired: true,
    useWorkSchedules: false, isSandbox: false, modes: ['identification'], attributes: ['display_name'],
    segments: [SEGMENT_NAMES.employees], accessPoints: [], keyed: false,
  },
};

/**
 * Synthetic identities of the sandbox: morphs (50/50 pixel blends) of two seed face crops, i.e. faces of people who
 * do not exist. Chosen from all 45 pairs of the ten seed faces: each blend is detected as exactly one face, its
 * embedding is at most ~0.46 cosine-similar to any seed face, and its mirrored blend (the second photo) at least
 * ~0.8 similar to it (measured with InsightFace w600k_mbf).
 */
export const SYNTHETIC_PAIRS: readonly (readonly [string, string])[] = [
  ['person-06', 'person-09'], ['person-01', 'person-09'], ['person-01', 'person-06'], ['person-06', 'person-10'],
  ['person-02', 'person-06'], ['person-02', 'person-09'], ['person-02', 'person-04'], ['person-05', 'person-10'],
  ['person-07', 'person-10'], ['person-01', 'person-10'], ['person-02', 'person-07'], ['person-01', 'person-05'],
  ['person-02', 'person-10'], ['person-05', 'person-06'], ['person-05', 'person-09'], ['person-05', 'person-07'],
  ['person-08', 'person-10'], ['person-03', 'person-04'], ['person-05', 'person-08'], ['person-02', 'person-08'],
];

/** The engine's identification threshold of an app with a small population (floor 0.50), verification floor 0.55. */
export function effectiveThreshold(app: AuthAppSpec, mode: AuthMode): number {
  return Math.max(app.threshold, mode === 'verification' ? 0.55 : 0.5);
}
