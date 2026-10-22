import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  ACCESS_POINT_RESOURCE,
  AREA_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the timeline's operations are bound under. */
export const IDENTITY_TIMELINE_BINDING = 'identity-timeline';

/** Entries the timeline reads at first, and how many more each "Show older" adds. */
export const TIMELINE_PAGE = 50;

/** The most entries `identity_timeline` returns at once. */
export const TIMELINE_MAX = 500;

/** One entry of `identity_timeline` (`itap_results.identity_timeline_entries`). */
export const timelineEntry = z.object({
  identity_id: z.string(),
  kind: z.string(),
  occurred_at: z.string(),
  facility_id: z.string().nullable(),
  area_id: z.string().nullable(),
  access_point_id: z.string().nullable(),
  device_id: z.string().nullable(),
  event_type: z.string().nullable(),
  severity: z.string().nullable(),
  title: z.string().nullable(),
  visit_id: z.string().nullable(),
  movement_type: z.string().nullable(),
  status: z.string().nullable(),
});

export type TimelineEntry = z.infer<typeof timelineEntry>;

const timelineInput = z.object({
  identityId: z.string().uuid(),
  limit: z.number().int().min(1).max(TIMELINE_MAX),
});

export const identityTimelineOperation = hasuraOperation(IDENTITY_TIMELINE_BINDING, 'identityTimeline', {
  kind: 'query',
  document: `query IdentityTimeline($identity: uuid!, $limit: Int!) {
  identity_timeline(args: { p_identity: $identity, p_limit: $limit }) {
    identity_id
    kind
    occurred_at
    facility_id
    area_id
    access_point_id
    device_id
    event_type
    severity
    title
    visit_id
    movement_type
    status
  }
}`,
  variables: (input) => {
    const { identityId, limit } = input as z.infer<typeof timelineInput>;
    return { identity: identityId, limit };
  },
  mapResult: (data) => rootOf(data, 'identity_timeline') ?? [],
});

/**
 * Where and when an identity was, newest first (`identity_timeline`): tracking sessions opened
 * and closed, each area it was seen in, its events and its visits' check-in and check-out,
 * including those of the identities merged into it.
 */
export const identityTimeline = defineQuery('itap:identity-timeline', {
  binding: identityTimelineOperation.binding,
  input: schema(timelineInput),
  output: schema(z.array(timelineEntry)),
  reads: [resourceByName(IDENTITY_RESOURCE), resourceByName(IDENTITY_MERGE_RESOURCE)],
});

const ids = z.array(z.string().uuid());
const placeNamesInput = z.object({ facilities: ids, areas: ids, accessPoints: ids, devices: ids });

const named = z.array(z.object({ id: z.string(), name: z.string() }));

/** The names the timeline shows, by id. */
export const placeNames = z.record(z.string(), z.string());

export type PlaceNames = z.infer<typeof placeNames>;

export const placeNamesOperation = hasuraOperation(IDENTITY_TIMELINE_BINDING, 'placeNames', {
  kind: 'query',
  document: `query PlaceNames($facilities: [uuid!]!, $areas: [uuid!]!, $accessPoints: [uuid!]!, $devices: [uuid!]!) {
  facilities(where: { id: { _in: $facilities } }) { id name }
  areas(where: { id: { _in: $areas } }) { id name }
  access_points(where: { id: { _in: $accessPoints } }) { id name }
  devices(where: { id: { _in: $devices } }) { id name }
}`,
  variables: (input) => input as z.infer<typeof placeNamesInput>,
  mapResult: (data) => {
    const out: Record<string, string> = {};
    for (const root of ['facilities', 'areas', 'access_points', 'devices']) {
      const rows = named.safeParse(rootOf(data, root));
      for (const row of rows.success ? rows.data : []) out[row.id] = row.name;
    }
    return out;
  },
});

/** The names of the facilities, areas, access points and devices a timeline names. */
export const timelinePlaceNames = defineQuery('itap:timeline-place-names', {
  binding: placeNamesOperation.binding,
  input: schema(placeNamesInput),
  output: schema(placeNames),
  reads: [
    resourceByName(FACILITY_RESOURCE),
    resourceByName(AREA_RESOURCE),
    resourceByName(ACCESS_POINT_RESOURCE),
    resourceByName(DEVICE_RESOURCE),
  ],
});

/** The distinct place ids of the entries, per kind, for {@link timelinePlaceNames}. */
export function placeIdsOf(entries: readonly TimelineEntry[]): z.infer<typeof placeNamesInput> {
  const pick = (key: 'facility_id' | 'area_id' | 'access_point_id' | 'device_id') => [
    ...new Set(entries.flatMap((entry) => (entry[key] === null ? [] : [entry[key]]))),
  ];
  return {
    facilities: pick('facility_id'),
    areas: pick('area_id'),
    accessPoints: pick('access_point_id'),
    devices: pick('device_id'),
  };
}
