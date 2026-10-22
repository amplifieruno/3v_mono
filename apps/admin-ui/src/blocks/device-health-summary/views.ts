import { implementBlock } from '@burojs/react';
import { deviceHealthSummaryBlock } from './device-health-summary-block';
import { DeviceHealthSummaryView } from './device-health-summary-view';

/** The device health summary's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const deviceHealthSummaryView = implementBlock(deviceHealthSummaryBlock, { component: DeviceHealthSummaryView });
