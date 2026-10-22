import { segmentStatsBlock } from '../../blocks/segment-stats/segment-stats-block';
import { segmentDailyStats, segmentDailyStatsOperation } from '../../blocks/segment-stats/segment-stats-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { SEGMENT_DAILY_STAT_RESOURCE, SEGMENT_RESOURCE, SEGMENT_TEMPLATE_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { segment } from './segment';
import { segmentDailyStat, segmentDailyStatFields } from './segment-daily-stat';
import { segmentFields } from './segment-fields';
import { SEGMENT_OPERATIONS, createSegmentFromTemplate, deleteSegment } from './segment-ops';
import { segmentTemplate, segmentTemplateFields } from './segment-template';

/**
 * Segments: manual and dynamic groups of profiles or identities (conditions evaluated by the
 * server), their templates (built in or the organization's own; "Create segment") and their daily
 * figures (the trend chart). Deleting a segment that is named or has history is refused with the
 * database's reason.
 */
export const segmentsModule = {
  name: 'segments-module',
  uses: [
    segment,
    segmentTemplate,
    segmentDailyStat,
    segmentDailyStats,
    segmentStatsBlock,
    deleteSegment,
    createSegmentFromTemplate,
  ],
  tables: {
    [SEGMENT_RESOURCE]: hasuraTable('segments', { selectFields: selectFieldsOf(segmentFields) }),
    [SEGMENT_TEMPLATE_RESOURCE]: hasuraTable('segment_templates', { selectFields: selectFieldsOf(segmentTemplateFields) }),
    [SEGMENT_DAILY_STAT_RESOURCE]: hasuraTable('segment_daily_stats', { selectFields: selectFieldsOf(segmentDailyStatFields) }),
  },
  operations: [segmentDailyStatsOperation, ...SEGMENT_OPERATIONS],
} as const satisfies ConsoleModule;
