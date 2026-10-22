import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Event, event rule and incident enums; values are the rows of the Hasura enum tables in `EVENT_ENUM_TABLES`. */

export const EVENT_SEVERITY_ENUM = 'event_severity';
export const EVENT_TYPE_ENUM = 'event_type';
export const EVENT_RULE_TYPE_ENUM = 'event_rule_type';
export const VERSION_STATUS_ENUM = 'version_status';
export const INCIDENT_STATUS_ENUM = 'incident_status';

/** Severities from the least to the most urgent: the database compares them by this rank (`severity_rank`). */
export const EVENT_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

/** The severities at or above `least`, for "high and above" filters (the order is the rank). */
export function severitiesFrom(least: EventSeverity): EventSeverity[] {
  return EVENT_SEVERITIES.slice(EVENT_SEVERITIES.indexOf(least));
}

export const EVENT_RULE_TYPES = [
  'after_hours',
  'loitering',
  'unusual_dwell',
  'occupancy',
  'restricted_area',
  'inactive_profile',
  'watchlist',
  'tailgating',
  'unexpected_facility',
  'abnormal_movement',
] as const;

export type EventRuleType = (typeof EVENT_RULE_TYPES)[number];

export const VERSION_STATUSES = ['draft', 'pending_approval', 'published', 'superseded'] as const;

export const INCIDENT_STATUSES = ['open', 'acknowledged', 'investigating', 'resolved', 'closed'] as const;

export const eventSeverityEnum = defineEnum({
  name: EVENT_SEVERITY_ENUM,
  values: enumValues(EVENT_SEVERITIES, {
    info: 'outline',
    low: 'secondary',
    medium: 'info',
    high: 'warning',
    critical: 'destructive',
  }),
  texts: {
    info: { label: 'Info', doc: { summary: 'For the record only: nothing to do.' } },
    low: { label: 'Low', doc: { summary: 'Worth a look when there is time.' } },
    medium: { label: 'Medium', doc: { summary: 'Should be looked at during the shift.' } },
    high: { label: 'High', doc: { summary: 'Needs an operator soon.' } },
    critical: { label: 'Critical', doc: { summary: 'Needs an operator now.' } },
  },
});

export const eventRuleTypeEnum = defineEnum({
  name: EVENT_RULE_TYPE_ENUM,
  values: enumValues(EVENT_RULE_TYPES, {
    after_hours: 'info',
    loitering: 'secondary',
    unusual_dwell: 'secondary',
    occupancy: 'warning',
    restricted_area: 'destructive',
    inactive_profile: 'warning',
    watchlist: 'destructive',
    tailgating: 'warning',
    unexpected_facility: 'info',
    abnormal_movement: 'secondary',
  }),
  texts: {
    after_hours: {
      label: 'After hours',
      doc: { summary: 'Someone seen in a facility outside its operating hours (not a person on a rostered shift).' },
    },
    loitering: {
      label: 'Loitering',
      doc: { summary: 'Someone staying in an area longer than the area’s loitering threshold.' },
    },
    unusual_dwell: {
      label: 'Unusual dwell',
      doc: { summary: 'Someone staying in an area longer than the rule’s own dwell time.' },
    },
    occupancy: { label: 'Occupancy', doc: { summary: 'More people in an area than its capacity.' } },
    restricted_area: {
      label: 'Restricted area',
      doc: { summary: 'Someone entering an area that the access policies or their clearance do not allow.' },
    },
    inactive_profile: {
      label: 'Inactive profile',
      doc: { summary: 'A suspended or terminated person seen by a camera.' },
    },
    watchlist: { label: 'Watch list', doc: { summary: 'A person on a watch list, blacklist or VIP list seen.' } },
    tailgating: {
      label: 'Tailgating',
      doc: { summary: 'More people passed a door than accesses were granted there.' },
    },
    unexpected_facility: {
      label: 'Unexpected facility',
      doc: { summary: 'A known person seen in a facility for the first time.' },
    },
    abnormal_movement: {
      label: 'Abnormal movement',
      doc: { summary: 'A move between two areas that people almost never make.' },
    },
  },
});

export const versionStatusEnum = defineEnum({
  name: VERSION_STATUS_ENUM,
  values: enumValues(VERSION_STATUSES, {
    draft: 'secondary',
    pending_approval: 'warning',
    published: 'success',
    superseded: 'outline',
  }),
  texts: {
    draft: { label: 'Draft', doc: { summary: 'Being edited; not enforced until it is published.' } },
    pending_approval: {
      label: 'Pending approval',
      doc: { summary: 'Submitted for approval; still editable and not enforced.' },
    },
    published: { label: 'Published', doc: { summary: 'The version in force: events are evaluated against it.' } },
    superseded: {
      label: 'Superseded',
      doc: { summary: 'Was in force before a later version was published; kept as history and can be published again.' },
    },
  },
});

export const incidentStatusEnum = defineEnum({
  name: INCIDENT_STATUS_ENUM,
  values: enumValues(INCIDENT_STATUSES, {
    open: 'destructive',
    acknowledged: 'warning',
    investigating: 'info',
    resolved: 'success',
    closed: 'outline',
  }),
  texts: {
    open: { label: 'Open', doc: { summary: 'Nobody has taken it on yet.' } },
    acknowledged: { label: 'Acknowledged', doc: { summary: 'An operator took it on; escalation stops.' } },
    investigating: { label: 'Investigating', doc: { summary: 'Being investigated.' } },
    resolved: { label: 'Resolved', doc: { summary: 'Settled with a disposition and a resolution.' } },
    closed: { label: 'Closed', doc: { summary: 'Final: no further changes.' } },
  },
});

/** Each enum above (and the event types, `./event-types.ts`) by the Hasura enum table holding its values. */
export const EVENT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [EVENT_SEVERITY_ENUM]: 'event_severities',
  [EVENT_TYPE_ENUM]: 'event_types',
  [EVENT_RULE_TYPE_ENUM]: 'event_rule_types',
  [VERSION_STATUS_ENUM]: 'version_statuses',
  [INCIDENT_STATUS_ENUM]: 'incident_statuses',
};
