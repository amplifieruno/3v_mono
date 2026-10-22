import { implementBlock } from '@burojs/react';
import { identityTimelineBlock } from './identity-timeline-block';
import { IdentityTimelineView } from './identity-timeline-view';

/** The identity timeline's view, for `<BuroProvider blockImplementations>` (via the people views). */
export const identityTimelineView = implementBlock(identityTimelineBlock, { component: IdentityTimelineView });
