import { occupancyNowView } from '../../blocks/occupancy-now/views';

/** The views of the monitoring module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const monitoringViews = [occupancyNowView] as const;
