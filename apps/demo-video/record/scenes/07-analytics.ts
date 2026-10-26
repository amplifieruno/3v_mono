import type { RecordedScene } from '../scene';
import { settle } from '../session';
import { scrollTo, tab } from '../ui';

/** Scene 7: thirty days of the building: occupancy, busy hours, movement between areas. */
export const analytics: RecordedScene = {
  id: 'analytics',
  start: '/analytics',
  async record(page, m) {
    await tab(page, m, 'Last 30 days');
    await m.wait('load', () => settle(page));
    await scrollTo(page, page.getByRole('heading', { name: 'Occupancy over time' }), 1000);
    await m.shot('charts');
    await page.waitForTimeout(2500);
    await scrollTo(page, page.getByRole('heading', { name: 'Busy hours' }), 1200);
    await m.shot('heatmap', page.getByText('Turnstile Gallery').first());
    await page.waitForTimeout(2500);
    await scrollTo(page, page.getByRole('heading', { name: 'Movement between areas' }), 1200);
    await m.shot('flows', page.getByText('Most frequent moves').first());
    await page.waitForTimeout(2500);
  },
};
