import { implementBlock } from '@burojs/react';
import { deliveryReportBlock } from './delivery-report-block';
import { DeliveryReportView } from './delivery-report-view';

/** The delivery report's view, for `<BuroProvider blockImplementations>` (via the notifications views). */
export const deliveryReportView = implementBlock(deliveryReportBlock, { component: DeliveryReportView });
