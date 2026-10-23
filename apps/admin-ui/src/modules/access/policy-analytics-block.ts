import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { ANALYTICS_PERIODS } from './policy-analytics-query';

/**
 * "Policy analytics" (`itap:policy-analytics`): the detail of `policy_analytics` for one period
 * (prop `period`): how often each policy version decided, versions in force that decided nothing,
 * why doors denied, the most denied person-door pairs, overlapping policies, how the grants ended
 * and the size of the rule set. The page's facts block shows the headline figures of the same read.
 */
export const policyAnalyticsBlock = defineBlock('itap:policy-analytics', {
  texts: {
    label: 'Policy analytics',
    loading: 'Reading the analytics…',
    failed: 'The analytics could not be read.',
    versionsTitle: 'Decisions by policy version',
    versionsNone: 'No policy version is in force and none decided in the period.',
    policy: 'Policy',
    version: 'Version',
    status: 'Status',
    effect: 'Effect',
    priority: 'Priority',
    hits: 'Decisions',
    granted: 'Granted',
    denied: 'Denied',
    lastHit: 'Last decision',
    never: 'Never',
    versionNumber: 'Version {{version}}',
    unusedTitle: 'In force but unused',
    unusedNone: 'Every version in force decided at least once in the period.',
    unusedNote: 'These versions decided nothing in the period: check whether they still name the right people and places.',
    reasonsTitle: 'Why doors denied',
    reasonsNone: 'No door denied anyone in the period.',
    reason: 'Reason',
    count: 'Count',
    topTitle: 'Most denied',
    person: 'Person',
    door: 'Access point',
    lastDenied: 'Last denied',
    unknownPerson: 'Unknown face',
    notVisible: 'Deleted or not visible',
    overlapsTitle: 'Overlapping policies',
    overlapsNone: 'No two versions in force name exactly the same people and places.',
    overlap_conflicting: 'Conflicting: {{a}} ({{effectA}}) and {{b}} ({{effectB}}) name the same people and places; priority decides.',
    overlap_same_effect: 'Redundant: {{a}} and {{b}} name the same people and places with the same effect.',
    grantsTitle: 'Grants of the period',
    grantsNote: 'Access grants valid at some time in the period, by how they ended (as of the end of the period).',
    grants_used: 'Used',
    grants_revoked: 'Revoked',
    grants_expired: 'Expired unused',
    grants_unused: 'Not used yet',
    complexityTitle: 'Rule set in force',
    complexity_enforced: 'Policies in force',
    complexity_subjects: 'Subjects (avg {{avg}} per policy)',
    complexity_targets: 'Targets (avg {{avg}} per policy)',
    complexity_schedules: 'With a schedule',
    complexity_maxRisk: 'With a maximum risk',
    read: 'Read {{time}}.',
  },
  props: {
    period: prop(z.enum(ANALYTICS_PERIODS)).default('30d'),
  },
});
