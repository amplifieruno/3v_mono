import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { LEGAL_HOLD_PROFILE_TARGET_RESOURCE, LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type HeldBy, heldBy, holdsOf } from './hold-notice-query';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

/** A person's rows somewhere: their profile, or one of their identities. */
const PERSON = `_or: [{ profile_id: { _eq: $profile } }, { identity: { profile_id: { _eq: $profile } } }]`;
const BY_IDENTITY = `identity: { profile_id: { _eq: $profile } }`;

export const erasureHoldsOperation = hasuraOperation(COMPLIANCE_BINDING, 'erasureHolds', {
  kind: 'query',
  // Mirrors the hold selection of `itap.dsr_erase` (migration 267): targets naming the person or one of
  // their identities, incidents naming one of their identities, and facilities where their detections,
  // locations, sessions, events or access decisions were recorded. Completed merges are not followed.
  document: `query ErasureHolds($profile: uuid!, $now: timestamptz!) {
  legal_hold_targets(where: {
    hold: { starts_at: { _lte: $now }, _or: [{ ends_at: { _is_null: true } }, { ends_at: { _gt: $now } }] }
    _or: [
      { profile_id: { _eq: $profile } }
      { ${BY_IDENTITY} }
      { incident: { incident_identities: { ${BY_IDENTITY} } } }
      { facility: { _or: [
        { detections: { ${BY_IDENTITY} } }
        { identity_locations: { ${BY_IDENTITY} } }
        { tracking_sessions: { ${PERSON} } }
        { events: { ${PERSON} } }
        { access_decisions: { ${PERSON} } }
      ] } }
    ]
  }) {
    profile_id
    identity_id
    incident_id
    facility_id
    hold { id name starts_at ends_at }
  }
}`,
  variables: (input) => ({ profile: (input as { profileId: string }).profileId, now: new Date().toISOString() }),
  mapResult: (data) => holdsOf(rootOf(data, 'legal_hold_targets')),
});

/** The legal holds in force an erasure of the person would honour (`itap:dsr-erasure-review`, the flow's gate). */
export const erasureHolds = defineQuery('itap:erasure-holds', {
  binding: erasureHoldsOperation.binding,
  input: schema(z.object({ profileId: z.string().uuid() })),
  output: schema(z.array(heldBy)),
  reads: [LEGAL_HOLD_RESOURCE, LEGAL_HOLD_PROFILE_TARGET_RESOURCE].map(resourceByName),
});

export interface ErasureHoldSplit {
  /** Holds on the person or one of their identities: the engine then keeps the profile, identities and biometrics. */
  readonly person: readonly HeldBy[];
  /** Holds on an incident naming them or a facility where they were recorded: those rows stay. */
  readonly places: readonly HeldBy[];
}

/** Splits the holds an erasure honours into person holds and incident / facility holds. */
export function splitErasureHolds(holds: readonly HeldBy[]): ErasureHoldSplit {
  const onPerson = (hold: HeldBy) => hold.via.includes('profile') || hold.via.includes('identity');
  return { person: holds.filter(onPerson), places: holds.filter((hold) => !onPerson(hold)) };
}
