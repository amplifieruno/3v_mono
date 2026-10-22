import { implementBlock } from '@burojs/react';
import { healthChartBlock } from './health-chart-block';
import { HealthChartView } from './health-chart-view';

/** The health chart block's view, for `<BuroProvider blockImplementations>` (via the devices views). */
export const healthChartView = implementBlock(healthChartBlock, { component: HealthChartView });
