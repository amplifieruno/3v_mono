import { formatCsv } from '../reports/render/csv.js';
import { addDays, localDate, zonedTime } from './historyTime.js';

/**
 * Search, bulk job and dashboard data of the seed (slice 7, design §9), pure and relative to `now`. Searches and
 * bulk jobs run through the real services (analyticsSearch, analyticsBulk); this module only says what and when.
 */

/** A face of the seed manifest by role (the n-th person of that role) and when the admin searched for it. */
export type FacialSearchSpec = { role: 'blacklisted' | 'vip' | 'unknown' | 'employee'; nth: number; daysAgo: number; minutes: number };
export type AttributeSearchSpec = { filters: (facility: string, now: Date) => Record<string, unknown>; daysAgo: number; minutes: number };

export const FACIAL_SEARCHES: FacialSearchSpec[] = [
  { role: 'blacklisted', nth: 0, daysAgo: 12, minutes: 9 * 60 + 20 },
  { role: 'unknown', nth: 0, daysAgo: 8, minutes: 15 * 60 + 5 },
  { role: 'vip', nth: 0, daysAgo: 5, minutes: 11 * 60 + 45 },
  { role: 'employee', nth: 1, daysAgo: 2, minutes: 16 * 60 + 30 },
];

const iso = (ms: number): string => new Date(ms).toISOString();
const DAY = 86_400_000;

export const ATTRIBUTE_SEARCHES: AttributeSearchSpec[] = [
  { filters: () => ({ profile_type: ['contractor'], linked: true }), daysAgo: 10, minutes: 10 * 60 + 10 },
  { filters: () => ({ linked: false, status: ['unverified', 'pending_verification'] }), daysAgo: 6, minutes: 14 * 60 + 40 },
  {
    filters: (facility, now) => ({ facility_id: facility, seen_from: iso(now.getTime() - 4 * DAY), seen_to: iso(now.getTime() - 3 * DAY) }),
    daysAgo: 3,
    minutes: 9 * 60 + 55,
  },
];

export const SHARED_SEARCH = {
  name: 'Unidentified faces',
  description: 'Camera identities not linked to a profile yet',
  search_type: 'attribute',
  filters: { linked: false, status: ['unverified', 'pending_verification'] },
  is_shared: true,
};
export const ALERT_SEARCH = {
  name: 'Blacklisted person lookalikes',
  description: 'Hourly check for new faces resembling the blacklisted visitor',
  search_type: 'facial',
  schedule_cron: '0 * * * *',
  alert_on_match: true,
  is_shared: false,
};

/** Epoch ms of local `minutes` on the local date `daysAgo` days before now. */
export function localAt(now: Date, timezone: string, daysAgo: number, minutes: number): number {
  return zonedTime(addDays(localDate(now.getTime(), timezone), -daysAgo), minutes, timezone);
}

const CONTRACTORS: [string, string, string][] = [
  ['Pavel', 'Orlov', 'Keystone Facility Services'],
  ['Irina', 'Lebedeva', 'Keystone Facility Services'],
  ['Maxim', 'Sokolov', 'Lumen Electrical Works'],
  ['Daria', 'Volkova', 'Lumen Electrical Works'],
  ['Artem', 'Zaitsev', 'Keystone Facility Services'],
  ['Olga', 'Morozova', 'Lumen Electrical Works'],
  ['Kirill', 'Belov', 'Keystone Facility Services'],
  ['Elena', 'Kozlova', 'Lumen Electrical Works'],
];

const IMPORT_HEADER = ['first_name', 'last_name', 'email', 'profile_type', 'company', 'job_title', 'start_date', 'end_date', 'access_level'];

function contractorRow(first: string, last: string, company: string, start: string, n: number): string[] {
  const domain = company.startsWith('Keystone') ? 'keystone-fs.example' : 'lumen-electric.example';
  return [
    first, last, `${first}.${last}@${domain}`.toLowerCase(), 'contractor', company, n % 2 === 0 ? 'Maintenance technician' : 'Electrician', start, addDays(start, 120), 'basic',
  ];
}

/** Profile import of 8 contractors starting on `start` (all valid: the job completes). */
export function contractorImportCsv(start: string): Buffer {
  return formatCsv([IMPORT_HEADER, ...CONTRACTORS.map(([f, l, c], n) => contractorRow(f, l, c, start, n))]);
}

/**
 * A spring-cleaning import with problems (the job ends `partial`): rows 1, 3 and 6 are valid, row 2 names an unknown
 * company, row 4 has an impossible date, row 5 lacks the last name, and one blank record is skipped.
 */
export function partialImportCsv(start: string): Buffer {
  const ok = (first: string, last: string, n: number) => contractorRow(first, last, 'Keystone Facility Services', start, 20 + n);
  return formatCsv([
    IMPORT_HEADER,
    ok('Roman', 'Gusev', 1),
    ['Viktor', 'Panin', 'viktor.panin@vendor.example', 'contractor', 'Northwind Cleaning Ltd', 'Cleaner', start, '', 'basic'],
    ok('Alina', 'Frolova', 3),
    ['Gleb', 'Titov', 'gleb.titov@keystone-fs.example', 'contractor', 'Keystone Facility Services', 'Cleaner', '2026-13-40', '', 'basic'],
    ['Nina', '', 'nina@keystone-fs.example', 'contractor', 'Keystone Facility Services', 'Cleaner', start, '', 'basic'],
    ['', '', '', '', '', '', '', '', ''],
    ok('Yuri', 'Markov', 6),
  ]);
}

/** Bulk face search input: one row per search image (file ids of the owner's `search` uploads). */
export function bulkSearchCsv(rows: { fileId: string; label: string }[]): Buffer {
  return formatCsv([['image_file_id', 'label'], ...rows.map((r) => [r.fileId, r.label])]);
}

export type DashboardWidget = {
  id: string;
  kind: string;
  title: string;
  query: string;
  params: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
};
/** `is_default`: the owner's landing dashboard ("On my Dashboard page"). */
export type DashboardSpec = {
  name: string;
  description: string;
  is_shared: boolean;
  is_default: boolean;
  owner: 'admin' | 'novaAdmin';
  widgets: DashboardWidget[];
};

const w = (id: string, kind: string, title: string, query: string, params: Record<string, unknown>, x: number, y: number, width: number, h: number): DashboardWidget => ({
  id, kind, title, query, params, position: { x, y, w: width, h },
});

/** "Security overview" (shared, the admin's) and "Facility manager" (personal, the Nova Tower admin's), each its owner's landing dashboard. */
export function dashboards(facility: string): DashboardSpec[] {
  return [
    {
      name: 'Security overview',
      description: 'Live situation for the security desk',
      is_shared: true,
      is_default: true,
      owner: 'admin',
      widgets: [
        w('kpis', 'kpi', 'Today', 'dashboard_kpis', {}, 0, 0, 12, 2),
        w('open-incidents', 'incidents_list', 'Open incidents', 'incidents', { status: ['open', 'acknowledged', 'investigating'], limit: 10 }, 0, 2, 7, 5),
        w('occupancy-now', 'occupancy_series', 'Occupancy now', 'facility_occupancy_now', { facility_id: facility }, 7, 2, 5, 5),
        w('devices', 'device_health', 'Cameras and terminals', 'devices', { facility_id: facility }, 0, 7, 6, 4),
        w('deliveries', 'deliveries', 'Notification deliveries (7 days)', 'delivery_report', { days: 7 }, 6, 7, 6, 4),
      ],
    },
    {
      name: 'Facility manager',
      description: 'Occupancy, flows and building health',
      is_shared: false,
      is_default: true,
      owner: 'novaAdmin',
      widgets: [
        w('occupancy-week', 'occupancy_series', 'Occupancy, last 7 days', 'occupancy_series', { facility_id: facility, bucket: 'hour', days: 7 }, 0, 0, 8, 4),
        w('busy-hours', 'heatmap', 'Busy hours by area', 'area_hourly_stats', { facility_id: facility, days: 30 }, 8, 0, 4, 4),
        w('flows', 'flow_matrix', 'Main flows (30 days)', 'flow_matrix', { facility_id: facility, days: 30 }, 0, 4, 6, 5),
        w('segments', 'segment_trend', 'Segment trends', 'segment_daily_stats', { days: 30 }, 6, 4, 6, 5),
        w('device-health', 'device_health', 'Device health (24 h)', 'device_health_metrics', { facility_id: facility, hours: 24 }, 0, 9, 12, 3),
      ],
    },
  ];
}
