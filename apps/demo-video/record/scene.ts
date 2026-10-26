import type { Page } from "@playwright/test";
import type { Marks } from "./marks";

/** A storyboard scene: `start` is opened and settled before the screencast starts. */
export type RecordedScene = {
  id: string;
  start: string;
  record(page: Page, m: Marks): Promise<void>;
};
