import { AUTH_APPS, type AuthAppKey, type AuthMode } from './authAppsPlan.js';
import { addDays, localDate, REPLAY_END_OFFSET_MS, weekday, zonedTime } from './historyTime.js';
import { seededRandom, type Random } from './random.js';
import { decideSteps, QUALITY_REASONS, type DecideStep, type PlanStep } from './authScenarios.js';

/**
 * The 30-day face authentication history of Nova Tower (slice 9, design §9): pure data, replayed through
 * itap.seed_auth_flow by authHistory.ts. Sessions run on weekdays inside each app's hours (the Lobby Kiosk inside the
 * Office Day schedule and the turnstile policy hours, so the engine's schedule and access point narrowing keep the
 * employees in the population); each session follows a scenario whose captures are template-derived probes (see
 * authProbes.ts), so the outcomes come from the real decision engine.
 */
export type { PlanStep } from './authScenarios.js';
export type HistoryApp = Exclude<AuthAppKey, 'legacy'>;
export type Scenario =
  | 'success' | 'partial_then_success' | 'quality_then_success' | 'quality_exhausted' | 'outsider' | 'liveness_failed'
  | 'printed_photo' | 'injection' | 'replay' | 'review' | 'second_factor_passed' | 'second_factor_failed' | 'impostor'
  | 'not_in_population' | 'not_retrieved';

export type AuthFlowPlan = {
  index: number;
  app: HistoryApp;
  mode: AuthMode;
  scenario: Scenario;
  /** Session start (ms). */
  at: number;
  /** Picks the subject (and, for impostors, the other person) from the runner's pools. */
  subject: number;
  other: number;
  accessPoint: string | null;
  device: string;
  ip: string;
  userAgent: string;
  steps: PlanStep[];
  /** Index of the earlier successful session whose sequence this one replays. */
  replayOf: number | null;
  /** Manual review of the queued attempt (approve / reject at `at`); null = still pending. */
  review: { at: number; approve: boolean; note: string } | null;
};

const MIN = 60_000;
const DAY = 86_400_000;

/** Local-time windows [from, to) in minutes per app (weekdays). */
export const AUTH_WINDOWS: Record<HistoryApp, [number, number][]> = {
  lobby: [[8 * 60 + 10, 10 * 60 + 30], [12 * 60 + 30, 14 * 60], [17 * 60 + 30, 19 * 60 + 30]],
  hr: [[9 * 60, 18 * 60]],
  visitor: [[9 * 60 + 30, 17 * 60]],
  sandbox: [[10 * 60, 19 * 60]],
};
const VOLUME: Record<HistoryApp, [number, number]> = { lobby: [12, 16], hr: [4, 6], visitor: [2, 4], sandbox: [3, 5] };

/** Scenarios that occur at least `n` times per app; the rest is drawn by weight. */
const FORCED: Record<HistoryApp, [Scenario, number][]> = {
  lobby: [['quality_then_success', 6], ['quality_exhausted', 1], ['liveness_failed', 2], ['printed_photo', 3], ['injection', 2],
    ['replay', 2], ['review', 8], ['partial_then_success', 6], ['outsider', 4]],
  hr: [['second_factor_passed', 4], ['second_factor_failed', 3], ['impostor', 4], ['not_in_population', 4], ['quality_then_success', 2],
    ['partial_then_success', 2]],
  visitor: [['not_retrieved', 4], ['outsider', 3], ['partial_then_success', 2], ['review', 2], ['quality_then_success', 1]],
  sandbox: [['outsider', 3], ['not_in_population', 2], ['impostor', 2], ['partial_then_success', 2], ['quality_then_success', 1]],
};
const WEIGHTS: Record<HistoryApp, [Scenario, number][]> = {
  lobby: [['success', 80], ['partial_then_success', 7], ['quality_then_success', 6], ['outsider', 4], ['printed_photo', 1], ['review', 2]],
  hr: [['success', 84], ['second_factor_passed', 5], ['impostor', 4], ['not_in_population', 3], ['quality_then_success', 4]],
  visitor: [['success', 85], ['not_retrieved', 5], ['outsider', 5], ['quality_then_success', 5]],
  sandbox: [['success', 80], ['partial_then_success', 8], ['outsider', 6], ['impostor', 3], ['quality_then_success', 3]],
};
/** Every scenario each app's history contains. */
export const SCENARIOS: Record<HistoryApp, Scenario[]> = {
  lobby: ['success', ...FORCED.lobby.map(([s]) => s)],
  hr: ['success', ...FORCED.hr.map(([s]) => s)],
  visitor: ['success', ...FORCED.visitor.map(([s]) => s)],
  sandbox: ['success', ...FORCED.sandbox.map(([s]) => s)],
};
const VERIFICATION_ONLY: Scenario[] = ['second_factor_passed', 'second_factor_failed', 'impostor', 'not_in_population'];

function weighted(rng: Random, weights: [Scenario, number][]): Scenario {
  let roll = rng.next() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [s, w] of weights) {
    roll -= w;
    if (roll < 0) return s;
  }
  return weights[0][0];
}

function shuffle<T>(rng: Random, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Session start times of one app: weekdays of the last 30 days, inside the app windows, ending before the live hour. */
function sessionTimes(app: HistoryApp, now: number, timezone: string, rng: Random): number[] {
  const times: number[] = [];
  const last = localDate(now, timezone);
  for (let date = localDate(now - 30 * DAY, timezone); date <= last; date = addDays(date, 1)) {
    if (weekday(date) > 5) continue;
    const [min, max] = VOLUME[app];
    const count = rng.int(min, max);
    for (let i = 0; i < count; i += 1) {
      const [from, to] = rng.pick(AUTH_WINDOWS[app]);
      const at = zonedTime(date, from, timezone) + rng.int(0, (to - from) * 60 - 1) * 1000;
      if (at >= now - 30 * DAY && at + 5 * MIN < now - REPLAY_END_OFFSET_MS) times.push(at);
    }
  }
  return times.sort((a, b) => a - b);
}

function scenariosFor(app: HistoryApp, count: number, rng: Random): Scenario[] {
  const forced = FORCED[app].flatMap(([s, n]) => Array.from({ length: n }, () => s));
  const rest = Array.from({ length: Math.max(0, count - forced.length) }, () => weighted(rng, WEIGHTS[app]));
  return shuffle(rng, [...forced, ...rest]).slice(0, count);
}

function modeOf(app: HistoryApp, scenario: Scenario, rng: Random): AuthMode {
  if (app === 'hr' || VERIFICATION_ONLY.includes(scenario)) return 'verification';
  if (app === 'sandbox' && scenario === 'success' && rng.chance(0.4)) return 'verification';
  return 'identification';
}

const DEVICES: Record<HistoryApp, (rng: Random, ap: string | null) => { device: string; ip: string; userAgent: string }> = {
  lobby: (_rng, ap) => {
    const n = Number(ap?.slice(-1) ?? 1);
    return { device: `lobby-kiosk-t${n}`, ip: `10.20.1.${20 + n}`, userAgent: 'itap-kiosk/2.4.1 (lobby)' };
  },
  hr: (rng) => ({ device: 'hr-portal-web', ip: `10.30.4.${rng.int(10, 240)}`, userAgent: 'Mozilla/5.0 (Windows NT 10.0) HRPortal/5.2' }),
  visitor: () => ({ device: 'reception-ipad-1', ip: '10.20.2.15', userAgent: 'VisitorCheckin/1.8 (iPadOS 18)' }),
  sandbox: (rng) => {
    const ci = rng.chance(0.6);
    return { device: ci ? 'sandbox-ci-runner' : `dev-laptop-${rng.int(1, 4)}`, ip: ci ? '172.16.8.40' : `172.16.9.${rng.int(10, 60)}`, userAgent: 'itap-sdk-node/0.9.0' };
  },
};

function accessPointOf(app: HistoryApp, scenario: Scenario, rng: Random): string | null {
  if (app === 'lobby') return `Turnstile ${rng.int(1, 3)}`;
  if (app === 'visitor' && scenario === 'not_retrieved') return 'Reception Desk';
  return null;
}

const REVIEW_NOTES = { approve: 'Identity confirmed by the lobby guard (badge checked)', reject: 'Not the employee: badge mismatch, escorted to reception' };

/** Evidence category of a failed capture (the first capture of each category keeps an evidence frame). */
function evidenceKind(f: AuthFlowPlan, s: DecideStep, last: boolean): string | null {
  if (s.quality && ['no_face', 'blur', 'poor_lighting'].includes(s.quality)) return s.quality;
  if (s.attack === 'printed_photo' || s.attack === 'injection') return s.attack;
  if (f.scenario === 'outsider' || f.scenario === 'not_in_population') return f.scenario;
  if (f.scenario === 'review' && last) return 'review';
  return null;
}

/** Replays (earlier success of the same app), reviews (the latest two stay pending) and evidence. */
function finish(flows: AuthFlowPlan[], now: number, rng: Random): void {
  for (const f of flows) {
    if (f.scenario !== 'replay') continue;
    const original = flows.slice(0, f.index).reverse().find((o) => o.app === f.app && o.scenario === 'success');
    if (original) f.replayOf = original.index;
    else {
      f.scenario = 'success';
      f.steps = decideSteps('success', f.mode, rng);
    }
  }
  const reviews = flows.filter((f) => f.scenario === 'review');
  reviews.slice(0, -2).forEach((f, i) => {
    const at = f.at + rng.int(20, 110) * MIN;
    const approve = i % 3 !== 2;
    if (at < now - REPLAY_END_OFFSET_MS) f.review = { at, approve, note: approve ? REVIEW_NOTES.approve : REVIEW_NOTES.reject };
  });
  const seen = new Set<string>();
  for (const f of flows) {
    const decides = f.steps.filter((s): s is DecideStep => s.kind === 'decide');
    decides.forEach((s, i) => {
      const kind = evidenceKind(f, s, i === decides.length - 1);
      if (kind === null || seen.has(kind)) return;
      seen.add(kind);
      s.evidence = true;
    });
  }
}

export function planAuthHistory(args: { now: number; timezone: string }): AuthFlowPlan[] {
  const rng = seededRandom('nova-tower/face-auth');
  const flows: Omit<AuthFlowPlan, 'index'>[] = [];
  for (const app of ['lobby', 'hr', 'visitor', 'sandbox'] as const) {
    const times = sessionTimes(app, args.now, args.timezone, rng);
    const scenarios = scenariosFor(app, times.length, rng);
    times.forEach((at, i) => {
      const scenario = scenarios[i];
      const mode = modeOf(app, scenario, rng);
      const accessPoint = accessPointOf(app, scenario, rng);
      flows.push({
        app, mode, scenario, at, accessPoint, ...DEVICES[app](rng, accessPoint),
        subject: rng.int(0, 999), other: rng.int(0, 999), steps: [], replayOf: null, review: null,
      });
    });
  }
  const sorted = flows.sort((a, b) => a.at - b.at || a.app.localeCompare(b.app)).map((f, index) => ({ ...f, index }));
  // Quality failure reasons in turn (time order), so every reason occurs.
  let turn = 0;
  for (const f of sorted) {
    const quality = QUALITY_REASONS[turn % QUALITY_REASONS.length];
    if (f.scenario.startsWith('quality_')) turn += 1;
    f.steps = decideSteps(f.scenario, f.mode, rng, quality);
  }
  finish(sorted, args.now, rng);
  return sorted;
}

/** Apps whose sessions this plan contains (every keyed app). */
export const HISTORY_APPS = (Object.keys(AUTH_WINDOWS) as HistoryApp[]).filter((k) => AUTH_APPS[k].keyed);
