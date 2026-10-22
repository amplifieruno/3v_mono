import { segmentStatsBlock } from '../../blocks/segment-stats/segment-stats-block';
import { segmentDailyStats, segmentDailyStatsOperation } from '../../blocks/segment-stats/segment-stats-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { segmentConditionsCatalog, segmentConditionsOperation } from '../../fields/segment-conditions-query';
import {
  SEGMENT_DAILY_STAT_RESOURCE,
  SEGMENT_IDENTITY_MEMBER_RESOURCE,
  SEGMENT_PROFILE_MEMBER_RESOURCE,
  SEGMENT_RESOURCE,
  SEGMENT_TEMPLATE_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { segment } from './segment';
import { segmentDailyStat, segmentDailyStatFields } from './segment-daily-stat';
import { segmentEvaluationBlock } from './segment-evaluation-block';
import { evaluateSegment, evaluateSegmentOperation, previewSegment, previewSegmentOperation } from './segment-evaluation-ops';
import { segmentFields } from './segment-fields';
import { segmentIdentityMember, segmentProfileMember } from './segment-member';
import { segmentIdentityMemberFields, segmentProfileMemberFields } from './segment-member-fields';
import {
  addSegmentMembers,
  addSegmentMembersOperation,
  removeSegmentMembers,
  removeSegmentMembersOperation,
} from './segment-membership-ops';
import { segmentPreviewBlock } from './segment-preview-block';
import { SEGMENT_OPERATIONS, createSegmentFromTemplate, deleteSegment } from './segment-ops';
import { segmentTemplate, segmentTemplateFields } from './segment-template';

/**
 * Segments: manual and dynamic groups of profiles or identities (conditions evaluated by the
 * server), their templates (built in or the organization's own; "Create segment") and their daily
 * figures (the trend chart). Deleting a segment that is named or has history is refused with the
 * database's reason. Membership: who is (and was) in a segment, read through one resource per
 * target; added by hand (`add_segment_members`), ended by hand (`remove_segment_members`) or by
 * the evaluation (`evaluate_segment`, "Evaluate now"); unsaved conditions are previewed with
 * `preview_segment`.
 */
export const segmentsModule = {
  name: 'segments-module',
  uses: [
    segment,
    segmentTemplate,
    segmentDailyStat,
    segmentProfileMember,
    segmentIdentityMember,
    segmentDailyStats,
    segmentStatsBlock,
    segmentConditionsCatalog,
    segmentPreviewBlock,
    segmentEvaluationBlock,
    previewSegment,
    evaluateSegment,
    addSegmentMembers,
    removeSegmentMembers,
    deleteSegment,
    createSegmentFromTemplate,
  ],
  tables: {
    [SEGMENT_RESOURCE]: hasuraTable('segments', { selectFields: selectFieldsOf(segmentFields) }),
    [SEGMENT_TEMPLATE_RESOURCE]: hasuraTable('segment_templates', { selectFields: selectFieldsOf(segmentTemplateFields) }),
    [SEGMENT_DAILY_STAT_RESOURCE]: hasuraTable('segment_daily_stats', { selectFields: selectFieldsOf(segmentDailyStatFields) }),
    // One table, two resources (G45): a membership names a profile or an identity, by the segment's target.
    [SEGMENT_PROFILE_MEMBER_RESOURCE]: hasuraTable('segment_members', {
      selectFields: selectFieldsOf(segmentProfileMemberFields),
      orderByField: 'added_at',
    }),
    [SEGMENT_IDENTITY_MEMBER_RESOURCE]: hasuraTable('segment_members', {
      selectFields: selectFieldsOf(segmentIdentityMemberFields),
      orderByField: 'added_at',
    }),
  },
  operations: [
    segmentDailyStatsOperation,
    segmentConditionsOperation,
    ...SEGMENT_OPERATIONS,
    previewSegmentOperation,
    evaluateSegmentOperation,
    addSegmentMembersOperation,
    removeSegmentMembersOperation,
  ],
} as const satisfies ConsoleModule;
