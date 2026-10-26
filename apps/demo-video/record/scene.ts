import type { Page } from '@playwright/test';
import type { Marks } from './marks';

/** One recorded shot: `prepare` runs off camera (navigation, tabs, scrolling), `record` is what the viewer sees. */
export type Beat = {
  id: string;
  prepare(page: Page): Promise<void>;
  record(page: Page, m: Marks): Promise<void>;
};

/** A storyboard scene: its beats are cut together with crossfades. Clip names are `<scene>-<beat>`. */
export type RecordedScene = { id: string; beats: Beat[] };
