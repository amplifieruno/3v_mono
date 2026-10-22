/**
 * The parameters of an event rule version (`event_rule_versions.parameters`, a JSON object) by the
 * rule's type, as the evaluators read them: `unusual_dwell` reads `dwell_seconds` (a number above
 * 0, else the rule never fires; `itap.evaluate_dwell_rules`), `watchlist` reads `watch_list_kinds`
 * (a non-empty subset of watch / blacklist / vip, absent = every kind; CHECK
 * `event_rule_versions_watch_list_kinds_valid`). Every other type takes no parameters: its
 * thresholds live on the place or in the organization settings.
 */
import type { FieldProblem } from './field-issue';

export const WATCH_LIST_KINDS = ['watch', 'blacklist', 'vip'] as const;

export type WatchListKind = (typeof WATCH_LIST_KINDS)[number];

export const WATCH_LIST_KIND_LABELS: Readonly<Record<WatchListKind, string>> = {
  watch: 'Watch list',
  blacklist: 'Blacklist',
  vip: 'VIP',
};

/** Where a rule type without parameters takes its thresholds from (shown in place of an editor). */
export const NO_PARAMETERS_NOTE: Readonly<Record<string, string>> = {
  after_hours: 'Uses the facility’s operating hours; people on a rostered shift are not reported.',
  loitering: 'Uses each area’s loitering threshold.',
  occupancy: 'Uses each area’s capacity.',
  restricted_area: 'Uses the access policies and grants, else the area’s access level against the person’s clearance.',
  inactive_profile: 'Fires for every suspended or terminated person seen.',
  tailgating: 'Uses the organization’s tailgating window.',
  unexpected_facility: 'Fires on a known person’s first visit to a facility.',
  abnormal_movement: 'Uses the organization’s abnormal-movement settings and 30 days of transitions.',
};

/** The rule types whose versions take parameters, and the keys each one reads. */
export const PARAMETER_KEYS: Readonly<Record<string, readonly string[]>> = {
  unusual_dwell: ['dwell_seconds'],
  watchlist: ['watch_list_kinds'],
};

export const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored object, or `{}` for nothing stored. */
export function parametersOf(value: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(value) ? value : {};
}

/** `value` with `key` set, or removed when `next` is `undefined`; every other key untouched. */
export function withParameter(value: unknown, key: string, next: unknown): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...parametersOf(value) };
  if (next === undefined) delete copy[key];
  else copy[key] = next;
  return copy;
}

/** The dwell time in whole minutes as the editor shows it, or `''` when none is stored. */
export function dwellMinutes(value: unknown): string {
  const seconds = parametersOf(value).dwell_seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) ? String(Math.round((seconds / 60) * 100) / 100) : '';
}

/** The stored seconds for minutes typed in the editor; `undefined` (no key) for an empty box. */
export function dwellSecondsOf(minutes: string): number | undefined {
  if (minutes.trim() === '') return undefined;
  const parsed = Number(minutes);
  return Number.isFinite(parsed) ? Math.round(parsed * 60) : Number.NaN;
}

/** The watch-list kinds the rule is limited to; empty = every kind. */
export function watchListKinds(value: unknown): WatchListKind[] {
  const kinds = parametersOf(value).watch_list_kinds;
  return Array.isArray(kinds) ? WATCH_LIST_KINDS.filter((kind) => kinds.includes(kind)) : [];
}

/** The parameters with `kind` switched on or off; no kind left removes the key (every kind). */
export function toggleKind(value: unknown, kind: WatchListKind, on: boolean): Record<string, unknown> {
  const current = new Set(watchListKinds(value));
  if (on) current.add(kind);
  else current.delete(kind);
  const next = WATCH_LIST_KINDS.filter((k) => current.has(k));
  return withParameter(value, 'watch_list_kinds', next.length === 0 ? undefined : next);
}

/** A dwell time in seconds as people read it: `40 min`, `1 h 30 min`. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The stored parameters as label and text pairs, the type's own first, other stored keys after. */
export function describeParameters(value: unknown, ruleType: unknown): { label: string; text: string }[] {
  const params = parametersOf(value);
  const rows: { label: string; text: string }[] = [];
  if (ruleType === 'unusual_dwell' || 'dwell_seconds' in params) {
    const seconds = params.dwell_seconds;
    rows.push({ label: 'Dwell time', text: typeof seconds === 'number' ? formatDuration(seconds) : 'Not set' });
  }
  if (ruleType === 'watchlist' || 'watch_list_kinds' in params) {
    const kinds = watchListKinds(value);
    rows.push({
      label: 'Watch-list kinds',
      text: kinds.length === 0 ? 'Every kind' : kinds.map((kind) => WATCH_LIST_KIND_LABELS[kind]).join(', '),
    });
  }
  for (const [key, stored] of Object.entries(params)) {
    if (key === 'dwell_seconds' || key === 'watch_list_kinds') continue;
    rows.push({ label: key, text: JSON.stringify(stored) });
  }
  return rows;
}

/**
 * `null` when the parameters are what the evaluators and the database accept for the rule type
 * (shape only when the type is unknown), else the first problem (code `ruleParameters.<reason>`).
 */
export function validateParameters(value: unknown, ruleType: unknown): FieldProblem | null {
  if (!isPlainObject(value)) {
    return { code: 'ruleParameters.notObject', text: 'Parameters must be an object of named values.' };
  }
  if ('dwell_seconds' in value) {
    const seconds = value.dwell_seconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      return { code: 'ruleParameters.dwell', text: 'Enter a dwell time above 0 minutes.' };
    }
  } else if (ruleType === 'unusual_dwell') {
    return {
      code: 'ruleParameters.dwellRequired',
      text: 'Enter the dwell time: an unusual-dwell rule without one never fires.',
    };
  }
  if ('watch_list_kinds' in value) {
    const kinds = value.watch_list_kinds;
    const valid =
      Array.isArray(kinds) &&
      kinds.length > 0 &&
      kinds.every((kind) => (WATCH_LIST_KINDS as readonly unknown[]).includes(kind));
    if (!valid) {
      return {
        code: 'ruleParameters.watchListKinds',
        text: 'Watch-list kinds must be some of watch, blacklist and VIP; leave all unticked for every kind.',
      };
    }
  }
  return null;
}

/** The rule type of the row or record the field belongs to, if it carries one. */
export function ruleTypeOf(
  props: { readonly record?: Readonly<Record<string, unknown>>; readonly form?: Readonly<Record<string, unknown>> },
  typeField: string,
): string | undefined {
  const type = props.form?.[typeField] ?? props.record?.[typeField];
  return typeof type === 'string' ? type : undefined;
}
