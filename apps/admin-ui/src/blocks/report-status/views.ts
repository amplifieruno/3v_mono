import { implementBlock } from '@burojs/react';
import { reportStatusBlock } from './report-status-block';
import { ReportStatusView } from './report-status-view';

/** The report progress block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const reportStatusView = implementBlock(reportStatusBlock, { component: ReportStatusView });
