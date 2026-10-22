import { implementBlock } from '@burojs/react';
import { incidentsListBlock } from './incidents-list-block';
import { IncidentsListView } from './incidents-list-view';

/** The incidents list block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const incidentsListView = implementBlock(incidentsListBlock, { component: IncidentsListView });
