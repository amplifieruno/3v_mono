import { defineBlock } from '@burojs/core';

/**
 * The retention plan (`itap:retention-plan`): a dry run of the nightly purge with
 * `retention_plan` (a query: nothing is purged, recorded or queued). Per active policy (and the
 * consent window): class, scope, action, retention, cutoff, rows a run would purge and rows a
 * legal hold keeps; "as of" now or a few days ahead; "Count again" re-reads.
 */
export const retentionPlanBlock = defineBlock('itap:retention-plan', {
  texts: {
    label: 'Retention plan',
    intro:
      'What the nightly retention run would purge if it ran at the chosen moment, per policy. This is a dry run: nothing is deleted, anonymized, archived or recorded, and no file is queued.',
    horizon: 'As of',
    horizon_0: 'Now',
    horizon_7: 'In 7 days',
    horizon_30: 'In 30 days',
    run: 'Count again',
    running: 'Counting…',
    failed: 'The plan could not be read.',
    none: 'No active retention policy: nothing is purged, every row is kept.',
    summary: '{{candidates}} rows would be purged; {{held}} rows past their retention are kept by legal holds.',
    nothing: 'Nothing is past its retention: a run now would purge nothing.',
    dataClass: 'Data class',
    scope: 'Scope',
    organization: 'Whole organization',
    unknownFacility: 'Facility not visible',
    action: 'Action',
    days: 'Keep for',
    daysValue: '{{days}} days',
    cutoff: 'Cutoff',
    candidates: 'Would purge',
    held: 'Kept by holds',
    policy: 'Policy',
    open: 'Open',
    consent: 'Consent window (organization settings)',
    counted: 'Counted {{time}}.',
  },
});
