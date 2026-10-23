import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { LEGAL_HOLD_RESOURCE, LEGAL_HOLD_PROFILE_TARGET_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

const ids = z.array(z.string().uuid());

/**
 * What a record page asks about: the record itself and what it is linked to. A profile asks for
 * targets naming it and identities linked to it; an identity for itself and its profile; an
 * incident for itself and its facility.
 */
export const holdNoticeInput = z.object({
  profileIds: ids,
  identityIds: ids,
  /** Identity targets whose identity is linked to one of these profiles. */
  identityProfileIds: ids,
  incidentIds: ids,
  facilityIds: ids,
});

export type HoldNoticeInput = z.infer<typeof holdNoticeInput>;

/** The ids the notice block receives (`itap:legal-hold-notice` props). */
export interface NoticeProps {
  readonly profileId?: string | null;
  readonly identityId?: string | null;
  readonly incidentId?: string | null;
  readonly linkedProfileId?: string | null;
  readonly facilityId?: string | null;
}

export const one = (value: string | null | undefined): string[] => (typeof value === 'string' && value !== '' ? [value] : []);

/** The read the notice makes for its props (empty lists match nothing). */
export function noticeInput(props: NoticeProps): HoldNoticeInput {
  const profile = one(props.profileId);
  return {
    profileIds: [...profile, ...one(props.linkedProfileId)],
    identityIds: one(props.identityId),
    identityProfileIds: profile,
    incidentIds: one(props.incidentId),
    facilityIds: one(props.facilityId),
  };
}

/** One hold in force covering the record, with what it names. */
export const heldBy = z.object({
  id: z.string(),
  name: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  /** Which kinds of target matched: `profile`, `identity`, `incident`, `facility`. */
  via: z.array(z.string()),
});

export type HeldBy = z.infer<typeof heldBy>;

const targetRow = z.object({
  profile_id: z.string().nullable(),
  identity_id: z.string().nullable(),
  incident_id: z.string().nullable(),
  facility_id: z.string().nullable(),
  hold: z.object({ id: z.string(), name: z.string(), starts_at: z.string(), ends_at: z.string().nullable() }),
});

/** The holds of matching target rows, one entry per hold, newest start first. */
export function holdsOf(rows: unknown): HeldBy[] {
  const parsed = z.array(targetRow).safeParse(rows);
  const byHold = new Map<string, HeldBy>();
  for (const row of parsed.success ? parsed.data : []) {
    const kind = row.profile_id !== null ? 'profile' : row.identity_id !== null ? 'identity' : row.incident_id !== null ? 'incident' : 'facility';
    const entry = byHold.get(row.hold.id) ?? { ...row.hold, via: [] };
    if (!entry.via.includes(kind)) entry.via.push(kind);
    byHold.set(row.hold.id, entry);
  }
  return [...byHold.values()].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}

export const holdNoticeOperation = hasuraOperation(COMPLIANCE_BINDING, 'legalHoldsCovering', {
  kind: 'query',
  document: `query LegalHoldsCovering($now: timestamptz!, $profiles: [uuid!]!, $identities: [uuid!]!, $identityProfiles: [uuid!]!, $incidents: [uuid!]!, $facilities: [uuid!]!) {
  legal_hold_targets(where: {
    hold: { starts_at: { _lte: $now }, _or: [{ ends_at: { _is_null: true } }, { ends_at: { _gt: $now } }] }
    _or: [
      { profile_id: { _in: $profiles } }
      { identity_id: { _in: $identities } }
      { identity: { profile_id: { _in: $identityProfiles } } }
      { incident_id: { _in: $incidents } }
      { facility_id: { _in: $facilities } }
    ]
  }) {
    profile_id
    identity_id
    incident_id
    facility_id
    hold { id name starts_at ends_at }
  }
}`,
  variables: (input) => {
    const { profileIds, identityIds, identityProfileIds, incidentIds, facilityIds } = input as HoldNoticeInput;
    return {
      now: new Date().toISOString(),
      profiles: profileIds,
      identities: identityIds,
      identityProfiles: identityProfileIds,
      incidents: incidentIds,
      facilities: facilityIds,
    };
  },
  mapResult: (data) => holdsOf(rootOf(data, 'legal_hold_targets')),
});

/**
 * The legal holds in force now that cover a record directly or through what it is linked to (a
 * profile's identities, an identity's profile, an incident's facility). The banner's read; the
 * retention engine itself also follows completed merges (`itap.legal_hold_subjects`).
 */
export const legalHoldsCovering = defineQuery('itap:legal-holds-covering', {
  binding: holdNoticeOperation.binding,
  input: schema(holdNoticeInput),
  output: schema(z.array(heldBy)),
  reads: [LEGAL_HOLD_RESOURCE, LEGAL_HOLD_PROFILE_TARGET_RESOURCE].map(resourceByName),
});
