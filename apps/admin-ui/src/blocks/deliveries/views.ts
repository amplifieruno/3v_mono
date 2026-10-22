import { implementBlock } from '@burojs/react';
import { deliveriesBlock } from './deliveries-block';
import { DeliveriesView } from './deliveries-view';

/** The deliveries block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const deliveriesView = implementBlock(deliveriesBlock, { component: DeliveriesView });
