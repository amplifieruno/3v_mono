import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_RESOURCE,
  AREA_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  TRACKING_SESSION_RESOURCE,
} from '../../data/resource-names';

/** Where a monitoring field is shown; every one of them is written by the platform only. */
export type Shown = readonly ('list' | 'show')[];

const SHOWN: Shown = ['list', 'show'];

interface RelationTexts {
  readonly label: string;
  readonly summary: string;
}

/**
 * A read-only relation of a tracking log (`detections`, `tracking_sessions`, `identity_locations`,
 * `area_occupancy`) to the record it names. `relationship` is the table's Hasura relationship
 * (it would name the hop of a dotted column or filter); `null` for a computed column, which has none.
 */
export function platformRelation(to: string, relationship: string | null, texts: RelationTexts, shown: Shown = SHOWN) {
  return f.relation({
    to,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    ...(relationship === null ? {} : { providerOptions: { relationship } }),
    texts: { label: texts.label, doc: { summary: texts.summary } },
  });
}

export const facilityRelation = (summary: string, shown?: Shown) =>
  platformRelation(FACILITY_RESOURCE, 'facility', { label: 'Facility', summary }, shown);

export const areaRelation = (summary: string, shown?: Shown, relationship = 'area', label = 'Area') =>
  platformRelation(AREA_RESOURCE, relationship, { label, summary }, shown);

export const deviceRelation = (summary: string, shown?: Shown) =>
  platformRelation(DEVICE_RESOURCE, 'device', { label: 'Camera', summary }, shown);

export const accessPointRelation = (summary: string, shown?: Shown, relationship = 'access_point', label = 'Access point') =>
  platformRelation(ACCESS_POINT_RESOURCE, relationship, { label, summary }, shown);

export const identityRelation = (summary: string, shown?: Shown) =>
  platformRelation(IDENTITY_RESOURCE, 'identity', { label: 'Identity', summary }, shown);

export const profileRelation = (summary: string, shown?: Shown, relationship: string | null = 'profile') =>
  platformRelation(PROFILE_RESOURCE, relationship, { label: 'Person', summary }, shown);

export const sessionRelation = (summary: string, shown?: Shown) =>
  platformRelation(TRACKING_SESSION_RESOURCE, 'session', { label: 'Session', summary }, shown);
