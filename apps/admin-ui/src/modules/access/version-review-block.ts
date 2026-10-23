import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What a policy version says, before it is submitted or approved
 * (`itap:access-policy-version-review`): the step's consequence (prop `step`), then effect,
 * priority, schedule, validity and maximum risk, and every subject (who) and target (where) by
 * name, read fresh from the server. The approver approves exactly what this lists: a pending
 * version is frozen.
 */
export const versionReviewBlock = defineBlock('itap:access-policy-version-review', {
  texts: {
    label: 'Version under review',
    submitIntro:
      'Submitting freezes the version: nothing in it can change until another member approves it (it goes in force) or rejects it (it goes back to draft).',
    approveIntro:
      'Approving puts this version in force at once: the doors decide by it from now on, and the version in force so far is superseded.',
    loading: 'Reading the version…',
    failed: 'The version could not be read.',
    gone: 'The version no longer exists.',
    heading: '{{code}} {{name}}, version {{version}}',
    settings: 'Settings',
    effect: 'Effect',
    priority: 'Priority',
    schedule: 'Schedule',
    always: 'Always',
    validity: 'Valid',
    validAlways: 'With no start or end',
    validFrom: 'From {{from}}',
    validUntil: 'Until {{until}}',
    validBetween: 'From {{from}} until {{until}}',
    maxRisk: 'Maximum risk',
    noLimit: 'No limit',
    subjects: 'Who ({{count}})',
    targets: 'Where ({{count}})',
    none: 'None yet: a version needs at least one before it can be submitted.',
    subjectProfile: 'Person: {{name}}',
    subjectSegment: 'Segment: {{name}}',
    subjectType: 'Profile type: {{name}}',
    subjectLevel: 'Access level {{name}} or higher',
    targetFacility: 'Facility: {{name}} (every door in it)',
    targetArea: 'Area: {{name}} (and the areas inside it)',
    targetPoint: 'Access point: {{name}}',
    unnamed: 'a record you cannot see',
  },
  props: {
    versionId: prop(z.string().nullable().optional()).default(null),
    step: prop(z.enum(['submit', 'approve'])).default('approve'),
  },
});
