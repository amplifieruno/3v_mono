import type { Page } from '@playwright/test';
import type { RecordedScene } from '../scene';
import { open, settle } from '../session';
import { scrollTo } from '../ui';

const heading = (page: Page, name: string) => page.getByRole('heading', { name });

/** Scene 7: thirty days of the building: occupancy, busy hours, movement between areas. */
export const analytics: RecordedScene = {
  id: 'analytics',
  beats: [
    {
      id: 'charts',
      async prepare(page) {
        await open(page, '/analytics');
        await page.getByRole('tab', { name: 'Last 30 days', exact: true }).click();
        await settle(page, 800);
        await scrollTo(page, undefined, heading(page, 'Occupancy over time'), 400);
      },
      async record(page) {
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'heatmap',
      prepare: (page) => scrollTo(page, undefined, heading(page, 'Busy hours'), 400),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('heatmap', heading(page, 'Busy hours'));
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'flows',
      prepare: (page) => scrollTo(page, undefined, heading(page, 'Movement between areas'), 400),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('flows', page.getByText('Most frequent moves').first());
        await page.waitForTimeout(4500);
      },
    },
  ],
};
