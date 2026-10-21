import type { ConsoleModule } from '../module';
import { dashboardPage } from './dashboard';
import { dashboardKpis, dashboardKpisOperation } from './kpis';

/** Overview: the dashboard and its `dashboard_kpis` figures. */
export const overviewModule = {
  name: 'overview-module',
  uses: [dashboardPage, dashboardKpis],
  operations: [dashboardKpisOperation],
} as const satisfies ConsoleModule;
