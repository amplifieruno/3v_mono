import type { RecordedScene } from '../scene';
import { navTo, openRow, scroll, tab } from '../ui';

/** Scene 4: the facility's area tree, the lobby plan with live occupancy, then another floor. */
export const places: RecordedScene = {
  id: 'places',
  start: '/facilities',
  async record(page, m) {
    await openRow(page, m, ['Nova Tower']);
    await tab(page, m, 'Areas');
    await m.shot('tree', page.getByRole('tabpanel').getByText('Server Room').first());
    await page.waitForTimeout(2500);
    await navTo(page, m, 'Floor plans');
    await openRow(page, m, ['Lobby (ground floor)']);
    await scroll(page, m, 280, 1200);
    await m.shot('lobby', page.locator('text').filter({ hasText: 'Turnstile Gallery' }));
    await page.waitForTimeout(3500);
    await page.goBack();
    await openRow(page, m, ['Floor 12']);
    await scroll(page, m, 280, 1200);
    await m.shot('floor12');
    await page.waitForTimeout(2500);
  },
};
