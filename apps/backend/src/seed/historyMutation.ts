import type { PlannedDetection, PointKey } from './historyScripts.js';
import type { ReplayDay } from './historyTime.js';

/**
 * One simulated day of the history replay as ONE GraphQL mutation (Hasura runs the root fields of a request in order
 * in one transaction). Per non-empty 5-minute window: evaluate_dwell_rules and close_stale_sessions at the window
 * start (what the live crons would have done by then; dwell first, so a stay is measured before its session closes),
 * the window's detections (one multi-row insert sorted by identity then detected_at: Stage A runs per row in that
 * order, rows of one identity in time order), then evaluate_detection (Stage B) for each detection in time order.
 * The day ends with dwell rules and stale sessions at its end, the daily lifecycle job and the notification finalizer
 * (itap.seed_finalize_notifications: the deliveries, inbox rows and webhook deliveries Stage C wrote get their
 * simulated times and outcomes).
 *
 * One transaction per day keeps the live crons out of a simulated day: they run against wall-clock now and would
 * close every replayed session that is still open between two requests. Days start at 04:00 local, when nobody is on
 * camera, so nothing is open across two days.
 */
export type ResolvedPoint = { device_id: string; area_id: string; access_point_id: string | null };

export const WINDOW_MS = 5 * 60_000;

export type DayMutation = { query: string; variables: Record<string, unknown>; detections: number };

type Row = Record<string, unknown> & { id: string; identity_id: string; detected_at: string };

export function buildDayMutation(args: {
  organization: string;
  day: ReplayDay;
  detections: PlannedDetection[];
  resolve: (point: PointKey) => ResolvedPoint;
  newId: () => string;
}): DayMutation {
  const { organization, day, resolve, newId } = args;
  const iso = (ms: number): string => new Date(ms).toISOString();
  const byWindow = new Map<number, PlannedDetection[]>();
  for (const d of args.detections) {
    if (d.at < day.start || d.at >= day.end) continue;
    const w = Math.floor((d.at - day.start) / WINDOW_MS);
    byWindow.set(w, [...(byWindow.get(w) ?? []), d]);
  }

  const fields: string[] = [];
  const defs: string[] = [];
  const variables: Record<string, unknown> = { org: organization };
  const crons = (suffix: string, at: number): void => {
    fields.push(`dw${suffix}: evaluate_dwell_rules(args: { p_organization: $org, p_at: "${iso(at)}" }) { id }`);
    fields.push(`cs${suffix}: close_stale_sessions(args: { p_organization: $org, p_at: "${iso(at)}" }) { id }`);
  };
  let count = 0;
  [...byWindow.keys()]
    .sort((a, b) => a - b)
    .forEach((w, n) => {
      crons(String(n), day.start + w * WINDOW_MS);
      const inTime = [...(byWindow.get(w) ?? [])].sort((a, b) => a.at - b.at || (a.identityId < b.identityId ? -1 : 1));
      const rows: Row[] = inTime.map((d) => ({
        id: newId(),
        organization_id: organization,
        ...resolve(d.point),
        identity_id: d.identityId,
        confidence: d.confidence,
        similarity: d.similarity,
        quality_score: d.quality,
        bbox: d.bbox,
        frame_width: 1920,
        frame_height: 1080,
        detected_at: iso(d.at),
      }));
      const inserted = [...rows].sort(
        (a, b) => (a.identity_id < b.identity_id ? -1 : a.identity_id > b.identity_id ? 1 : 0) || a.detected_at.localeCompare(b.detected_at),
      );
      defs.push(`$w${n}: [detections_insert_input!]!`);
      variables[`w${n}`] = inserted;
      fields.push(`in${n}: insert_detections(objects: $w${n}) { affected_rows }`);
      rows.forEach((row, i) => fields.push(`e${n}_${i}: evaluate_detection(args: { p_detection: "${row.id}" }) { id }`));
      count += rows.length;
    });
  crons('End', day.end);
  fields.push(`lifecycle: run_lifecycle_jobs(args: { p_organization: $org, p_at: "${iso(day.end)}" }) { id }`);
  // Stage C wrote the day's notifications with the transaction time: date and settle them (digests at their hourly
  // runs, stub sending, inbox reads) at the simulated times before the commit fires the sending triggers.
  fields.push(`notifications: seed_finalize_notifications(args: { p_organization: $org, p_until: "${iso(day.end)}" }) { id }`);

  const query = `mutation SeedHistoryDay($org: uuid!${defs.length > 0 ? `, ${defs.join(', ')}` : ''}) {\n  ${fields.join('\n  ')}\n}`;
  return { query, variables, detections: count };
}
