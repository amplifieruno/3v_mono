import { segmentStatsView } from '../../blocks/segment-stats/views';

/** The views of the segments module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const segmentsViews = [segmentStatsView] as const;
