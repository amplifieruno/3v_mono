import type { RecordedScene } from '../scene';
import { open } from '../session';
import { navTo, openRow, scroll, tab } from '../ui';

/** Scene 4: the facility's area tree, the lobby plan with live occupancy, then another floor. */
export const places: RecordedScene = {
  id: 'places',
  beats: [
    {
      id: 'tree',
      async prepare(page) {
        await open(page, '/facilities');
        await openRow(page, ['Nova Tower']);
        await tab(page, 'Areas');
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('tree', page.getByRole('tabpanel').getByText('Server Room').first());
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'lobby',
      async prepare(page) {
        await navTo(page, 'Floor plans');
        await openRow(page, ['Lobby (ground floor)']);
        await scroll(page, undefined, 280, 400);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        const gallery = page.locator('text').filter({ hasText: 'Turnstile Gallery' }).first();
        await m.focus(gallery, 'turnstiles');
        await page.waitForTimeout(1500);
        await m.shot('lobby', gallery);
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'floor12',
      async prepare(page) {
        await navTo(page, 'Floor plans');
        await openRow(page, ['Floor 12']);
        await scroll(page, undefined, 280, 400);
      },
      async record(page) {
        await page.waitForTimeout(4500);
      },
    },
  ],
};
