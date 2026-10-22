import { type FlowConfig, cond, defineMutation, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { NAV_ICONS } from '../../app/nav';
import { hasuraOperation, rootOf } from '../../data/operations';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { fieldApplied } from '../../data/status-applied';
import { checkNotBlank } from '../../fields/not-blank';
import { PEOPLE_BINDING } from './profile-activity';

export const setProcessingRestrictionInput = z.object({
  profileId: z.string().uuid(),
  restricted: z.boolean(),
  reason: z.string().trim().min(1),
});

/** The profile as the function returns it, reduced to the restriction state. */
export const setProcessingRestrictionOutput = z.object({ id: z.string(), processing_restricted: z.boolean() });

/**
 * `set_processing_restriction(hasura_session, p_profile, p_restricted, p_reason)` (org_admin): sets
 * or lifts the restriction (idempotent; audited with the reason). Hasura fills the session.
 */
export const setProcessingRestrictionOperation = hasuraOperation(PEOPLE_BINDING, 'setProcessingRestriction', {
  kind: 'mutation',
  document: `mutation SetProcessingRestriction($profile: uuid!, $restricted: Boolean!, $reason: String!) {
  set_processing_restriction(args: { p_profile: $profile, p_restricted: $restricted, p_reason: $reason }) {
    id
    processing_restricted
  }
}`,
  variables: (input) => {
    const { profileId, restricted, reason } = input as z.infer<typeof setProcessingRestrictionInput>;
    return { profile: profileId, restricted, reason };
  },
  mapResult: (data) => {
    const rows = rootOf(data, 'set_processing_restriction');
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  },
});

/**
 * Restricts or lifts the processing of a person's data (GDPR Art. 18). Restricting leaves the
 * person's faces out of recognition, face authentication, search and dynamic segments, closes
 * their open tracking sessions and manual segment memberships, and freezes the identity links;
 * nothing is deleted. The database refuses both on an erased profile and without a reason.
 */
export const setProcessingRestriction = defineMutation('itap:set-processing-restriction', {
  binding: setProcessingRestrictionOperation.binding,
  input: schema(setProcessingRestrictionInput),
  output: schema(setProcessingRestrictionOutput.nullable()),
  effects: [{ resource: PROFILE_RESOURCE }],
});

const reasonFields = {
  reason: f.text({
    required: true,
    // The function refuses a reason of spaces only (`processing_restriction_reason_required`).
    validate: checkNotBlank<string>(),
    texts: {
      label: 'Reason',
      doc: {
        summary:
          'Why, as it will stand in the audit log and on the profile, such as "Accuracy of the data contested by the person (request of 21 Oct)".',
      },
    },
  }),
};

const isRestricted = cond.equals(ref('record', 'processing_restricted'), true);

/** The profile header's menu: a flow of one profile. */
const surfaces = { default: false, show: 'menu' } as const;

/** "Restrict processing": a reason, a confirm stating the effects, then the function. */
export const restrictProcessingFlow = {
  texts: {
    label: 'Restrict processing',
    confirm:
      'Restrict processing of this person’s data? Their faces leave recognition, face authentication, search and dynamic segments, their open tracking sessions and manual segment memberships close, and their identities cannot be linked or unlinked until the restriction is lifted. Nothing is deleted.',
    notify: 'Processing restricted.',
    doc: {
      summary:
        'Restricts processing of the person’s data (GDPR Art. 18), for example while the accuracy of the data is contested. Nothing is deleted; lift it when the reason is gone.',
    },
  },
  icon: NAV_ICONS.restrictProcessing,
  variant: 'destructive',
  surfaces,
  when: cond.not(isRestricted),
  confirm: true,
  form: { fields: reasonFields },
  submit: {
    mutation: setProcessingRestriction,
    input: { profileId: ref('record', 'id'), restricted: true, reason: ref('values', 'reason') },
    onUnknown: { check: fieldApplied(PROFILE_RESOURCE, 'processing_restricted', true) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof reasonFields>;

/** "Lift restriction": a reason, then the function; the person is processed again as before. */
export const liftRestrictionFlow = {
  texts: {
    label: 'Lift restriction',
    confirm:
      'Lift the restriction? The person’s faces are recognised and searchable again and their identities can be linked; closed sessions and memberships are not reopened.',
    notify: 'Restriction lifted.',
    doc: {
      summary:
        'Ends the restriction of processing: the person is recognised, searched and segmented again. Sessions and memberships closed by the restriction stay closed.',
    },
  },
  icon: NAV_ICONS.liftRestriction,
  surfaces,
  when: isRestricted,
  confirm: true,
  form: { fields: reasonFields },
  submit: {
    mutation: setProcessingRestriction,
    input: { profileId: ref('record', 'id'), restricted: false, reason: ref('values', 'reason') },
    onUnknown: { check: fieldApplied(PROFILE_RESOURCE, 'processing_restricted', false) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof reasonFields>;
