import { addDays, localDate, weekday, zonedTime } from './historyTime.js';

/**
 * Report configuration and past reports of the seed (slice 7, design §9), as pure data relative to `now`:
 * a system template per report type (both organizations), two Nova Tower schedules (weekly occupancy -> Facility
 * managers by email; daily incidents -> Security team in the app) and the past reports the seed generates through
 * the real pipeline (compute_report + renderer), back-dated to when they would have run: the last three weekly
 * occupancy reports and three daily incident summaries of their schedules, four ad-hoc reports by the admin, and one
 * report that failed.
 */
export type ReportType =
  | 'flow' | 'occupancy' | 'heatmap' | 'behavior' | 'attendance' | 'segment' | 'compliance' | 'device_health'
  | 'incident' | 'incident_summary';
export type ReportFormat = 'pdf' | 'xlsx' | 'csv' | 'json';
type Period = 'previous_day' | 'previous_week' | 'previous_month';

export type TemplateSpec = { name: string; description: string; report_type: ReportType; format: ReportFormat; period: Period | null };

export const TEMPLATES: TemplateSpec[] = [
  { name: 'Weekly occupancy', description: 'Daily visitors, visits and peak occupancy per facility', report_type: 'occupancy', format: 'pdf', period: 'previous_week' },
  { name: 'Weekly flows', description: 'Movements between areas', report_type: 'flow', format: 'xlsx', period: 'previous_week' },
  { name: 'Weekly heatmap', description: 'Area activity by hour of day', report_type: 'heatmap', format: 'json', period: 'previous_week' },
  { name: 'Visit frequency', description: 'Identities by visits in the last 30 days', report_type: 'behavior', format: 'pdf', period: 'previous_week' },
  { name: 'Weekly attendance', description: 'Scheduled staff present, late or absent', report_type: 'attendance', format: 'csv', period: 'previous_week' },
  { name: 'Segment trends', description: 'Segment membership per day', report_type: 'segment', format: 'csv', period: 'previous_week' },
  { name: 'Monthly compliance', description: 'Audit activity and consent status', report_type: 'compliance', format: 'pdf', period: 'previous_month' },
  { name: 'Device health', description: 'Health samples, errors and outages per device', report_type: 'device_health', format: 'pdf', period: 'previous_week' },
  { name: 'Incident report', description: 'One incident with its timeline', report_type: 'incident', format: 'pdf', period: null },
  { name: 'Daily incidents', description: 'Incidents opened the previous day', report_type: 'incident_summary', format: 'pdf', period: 'previous_day' },
];

export type ScheduleSpec = { name: string; template: string; cron: string; channel: 'email' | 'in_app'; group: string };

export const SCHEDULES: ScheduleSpec[] = [
  { name: 'Weekly occupancy', template: 'Weekly occupancy', cron: '0 7 * * 1', channel: 'email', group: 'Facility managers' },
  { name: 'Daily incidents', template: 'Daily incidents', cron: '0 7 * * *', channel: 'in_app', group: 'Security team' },
];

export type PastReport = {
  template: string;
  report_type: ReportType;
  format: ReportFormat;
  title: string;
  start_date: string;
  end_date: string;
  /** When it was generated (epoch ms); requested a few minutes earlier. */
  generatedAt: number;
  /** Scheduled reports: the schedule's run instant (cron time) that produced it. */
  runAt: number | null;
  schedule: string | null;
  /** Ad-hoc reports target the facility explicitly; scheduled ones cover the organization. */
  facilityTarget: boolean;
  /** A report that failed (no file): its error. */
  error?: string;
};

const MINUTE = 60_000;

function title(name: string, start: string, end: string): string {
  return `${name} ${start}${end === start ? '' : ` - ${end}`}`;
}

/** Monday of the ISO week of `date`. */
function monday(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export function pastReports(now: Date, timezone: string): PastReport[] {
  const today = localDate(now.getTime(), timezone);
  const thisMonday = monday(today);
  const at = (date: string, minutes: number) => zonedTime(date, minutes, timezone);
  const out: PastReport[] = [];
  const template = (name: string): TemplateSpec => {
    const t = TEMPLATES.find((x) => x.name === name);
    if (!t) throw new Error(`seed: report template ${name} missing`);
    return t;
  };
  const add = (name: string, start: string, end: string, generatedAt: number, extra: Partial<PastReport> = {}): void => {
    const t = template(name);
    out.push({
      template: name, report_type: t.report_type, format: t.format, title: title(name, start, end), start_date: start,
      end_date: end, generatedAt, runAt: null, schedule: null, facilityTarget: true, ...extra,
    });
  };
  // Scheduled: the last three weeks (Monday 07:00 after the week) and the last three days (07:00 the next day).
  for (const weeks of [3, 2, 1]) {
    const start = addDays(thisMonday, -7 * weeks);
    const runAt = at(addDays(start, 7), 7 * 60);
    add('Weekly occupancy', start, addDays(start, 6), runAt + 2 * MINUTE, { schedule: 'Weekly occupancy', runAt, facilityTarget: false });
  }
  for (const days of [3, 2, 1]) {
    const day = addDays(today, -days);
    const runAt = at(addDays(day, 1), 7 * 60);
    add('Daily incidents', day, day, runAt + MINUTE, { schedule: 'Daily incidents', runAt, facilityTarget: false });
  }
  // Ad hoc, requested by the admin on the latest Monday morning that is over (else the one before).
  const anchor = now.getTime() >= at(thisMonday, 12 * 60) ? thisMonday : addDays(thisMonday, -7);
  const lastWeek = addDays(anchor, -7);
  const lastSunday = addDays(anchor, -1);
  add('Weekly flows', lastWeek, lastSunday, at(anchor, 9 * 60 + 40));
  add('Weekly heatmap', lastWeek, lastSunday, at(anchor, 9 * 60 + 52));
  add('Weekly attendance', lastWeek, lastSunday, at(anchor, 10 * 60 + 15));
  add('Device health', addDays(lastWeek, -7), addDays(lastSunday, -7), at(addDays(anchor, -7), 11 * 60 + 5));
  add('Visit frequency', lastWeek, lastSunday, at(anchor, 10 * 60 + 30), {
    error: 'File upload failed: storage service unavailable (HTTP 503)',
  });
  return out.filter((r) => r.generatedAt < now.getTime() - 10 * MINUTE).sort((a, b) => a.generatedAt - b.generatedAt);
}
