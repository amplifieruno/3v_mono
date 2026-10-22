import { healthChartView } from '../../blocks/health-chart/views';
import { liveCameraView, liveWallView } from '../../blocks/live-camera/views';

/** The views of the devices module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const devicesViews = [healthChartView, liveCameraView, liveWallView] as const;
