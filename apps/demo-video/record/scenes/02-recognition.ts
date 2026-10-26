import type { RecordedScene } from '../scene';
import { navTo, openRow, tab } from '../ui';

/** Scene 2: a camera's live view naming known people, then the live wall. */
export const recognition: RecordedScene = {
  id: 'recognition',
  start: '/devices',
  async record(page, m) {
    await openRow(page, m, ['Loading Dock Camera'], 'Loading Dock');
    await tab(page, m, 'Live');
    // Prefer a named box; the overlay's accessible name lists the labels on screen.
    const overlay = page.getByRole('img', { name: /^Faces recognised on/ });
    const named = page.getByRole('img', { name: /Isabella Donovan|Emma Dawson/ });
    await m.wait('first known face', () =>
      named.waitFor({ timeout: 60_000 }).catch(() => overlay.waitFor()),
    );
    await m.focus(overlay, 'named box');
    await m.shot(
      'named-box',
      page.locator('text').filter({ hasText: /Isabella Donovan|Emma Dawson|Thomas Kirby/ }),
    );
    await page.waitForTimeout(3500);
    await navTo(page, m, 'Live wall');
    await page.waitForTimeout(1500);
    await m.shot('wall', page.getByText('Main Entrance Camera').first());
    await page.waitForTimeout(3500);
  },
};
