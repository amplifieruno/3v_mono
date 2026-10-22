import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Report enums. Types and statuses are the rows of the Hasura enum tables in `REPORT_ENUM_TABLES`; the
 * report format is shared with the incident report flow (`./incidents.ts`). The schedule channels and the
 * template periods are console-only choices (G52 subset, jsonb key).
 */

export const REPORT_TYPE_ENUM = 'report_type';
export const REPORT_STATUS_ENUM = 'report_status';
/** The channels a report schedule delivers on (`report_schedules_channel_allowed`), a subset of the notification channels (G52). */
export const REPORT_CHANNEL_ENUM = 'report_schedule_channel';
/** `parameters.period` of a template (`itap.valid_report_parameters`): the previous complete period a scheduled run covers. */
export const REPORT_PERIOD_ENUM = 'report_period';

export const REPORT_TYPES = [
  'occupancy',
  'flow',
  'heatmap',
  'behavior',
  'attendance',
  'segment',
  'compliance',
  'device_health',
  'incident_summary',
  'incident',
] as const;
export const REPORT_STATUSES = ['queued', 'generating', 'completed', 'failed', 'expired'] as const;
export const REPORT_CHANNELS = ['email', 'in_app', 'webhook'] as const;
export const REPORT_PERIODS = ['previous_day', 'previous_week', 'previous_month'] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const reportTypeEnum = defineEnum({
  name: REPORT_TYPE_ENUM,
  values: enumValues(REPORT_TYPES, {
    occupancy: 'info',
    flow: 'info',
    heatmap: 'info',
    behavior: 'secondary',
    attendance: 'secondary',
    segment: 'secondary',
    compliance: 'outline',
    device_health: 'outline',
    incident_summary: 'warning',
    incident: 'warning',
  }),
  texts: {
    occupancy: { label: 'Occupancy', doc: { summary: 'Per facility and day: visitors (known and unknown), visits, dwell and the peak.' } },
    flow: { label: 'Movement between areas', doc: { summary: 'How many moves went from each area to each other area over the period.' } },
    heatmap: { label: 'Busy hours', doc: { summary: 'Activity per area and hour of the day (local time), over the period.' } },
    behavior: {
      label: 'Visit frequency',
      doc: { summary: 'People by how often they came in the last 30 days, with dwell and after-hours visits: a snapshot, not bound to the period.' },
    },
    attendance: {
      label: 'Attendance',
      doc: { summary: 'Staff with a work schedule: present, late or absent on each scheduled day of the period.' },
    },
    segment: { label: 'Segment trends', doc: { summary: 'Members per day of the chosen segments (all segments when none is chosen).' } },
    compliance: { label: 'Compliance', doc: { summary: 'Audit activity of the period and the state of consent.' } },
    device_health: { label: 'Device health', doc: { summary: 'Health checks, errors and outages per device over the period.' } },
    incident_summary: {
      label: 'Incident summary',
      doc: { summary: 'Incidents opened in the period, by severity and status, with the average time to resolve.' },
    },
    incident: { label: 'Incident report', doc: { summary: 'One incident with its timeline, notes and linked events.' } },
  },
});

export const reportStatusEnum = defineEnum({
  name: REPORT_STATUS_ENUM,
  values: enumValues(REPORT_STATUSES, {
    queued: 'secondary',
    generating: 'info',
    completed: 'success',
    failed: 'destructive',
    expired: 'outline',
  }),
  texts: {
    queued: { label: 'Queued', doc: { summary: 'Waiting to be generated; this takes seconds.' } },
    generating: { label: 'Generating', doc: { summary: 'The figures are being computed and the file written.' } },
    completed: { label: 'Completed', doc: { summary: 'The file is ready to open.' } },
    failed: { label: 'Failed', doc: { summary: 'Generation failed; the error says why. Retry queues it again.' } },
    expired: { label: 'Expired', doc: { summary: 'The file was removed by the retention policy; the record stays.' } },
  },
});

const CHANNEL_TEXTS = {
  email: { label: 'Email', doc: { summary: 'Each member of the recipient group gets an email with a link to the file.' } },
  in_app: { label: 'In app', doc: { summary: 'Each member of the recipient group finds it in the console’s inbox.' } },
  webhook: {
    label: 'Webhook',
    doc: { summary: 'No recipients: the report_generated event goes to the webhook subscriptions that take it.' },
  },
} as const;

export const reportChannelEnum = defineEnum({
  name: REPORT_CHANNEL_ENUM,
  values: enumValues(REPORT_CHANNELS, { email: 'secondary', in_app: 'info', webhook: 'outline' }),
  texts: CHANNEL_TEXTS,
});

export const reportPeriodEnum = defineEnum({
  name: REPORT_PERIOD_ENUM,
  values: enumValues(REPORT_PERIODS, { previous_day: 'secondary', previous_week: 'secondary', previous_month: 'secondary' }),
  texts: {
    previous_day: { label: 'Previous day', doc: { summary: 'Yesterday, in the schedule’s time zone.' } },
    previous_week: { label: 'Previous week', doc: { summary: 'The last complete week, Monday to Sunday.' } },
    previous_month: { label: 'Previous month', doc: { summary: 'The last complete calendar month.' } },
  },
});

/** Each Hasura-backed enum above by the enum table holding its values. */
export const REPORT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [REPORT_TYPE_ENUM]: 'report_types',
  [REPORT_STATUS_ENUM]: 'report_statuses',
};
