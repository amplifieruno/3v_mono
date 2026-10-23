import { implementBlock } from '@burojs/react';
import { bulkJobProgressBlock } from './bulk-job-progress-block';
import { BulkJobProgressView } from './bulk-job-progress-view';

/** The bulk job progress block's view, for `<BuroProvider blockImplementations>` (via the search views). */
export const bulkJobProgressView = implementBlock(bulkJobProgressBlock, { component: BulkJobProgressView });
