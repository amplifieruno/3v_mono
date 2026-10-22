import { implementBlock } from '@burojs/react';
import { kpisBlock } from './kpis-block';
import { KpisView } from './kpis-view';

/** The KPI block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const kpisView = implementBlock(kpisBlock, { component: KpisView });
