import { implementBlock } from '@burojs/react';
import { deviceHealthDayBlock } from './device-health-day-block';
import { DeviceHealthDayView } from './device-health-day-view';

/** The 24-hour device health table's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const deviceHealthDayView = implementBlock(deviceHealthDayBlock, { component: DeviceHealthDayView });
