import type { RecordedScene } from '../scene';
import { open, settle } from '../session';
import { openRow, scrollTo, tab } from '../ui';

/** Scene 2: the server-room camera naming Thomas Kirby live, then the live wall. */
export const recognition: RecordedScene = {
  id: 'recognition',
  beats: [
    {
      id: 'camera',
      async prepare(page) {
        await open(page, '/devices');
        await openRow(page, ['Server Room Camera'], 'Server Room');
        await tab(page, 'Live');
        // The whole camera frame in view: scroll its top up near the header.
        await scrollTo(
          page,
          undefined,
          page.getByRole('img', { name: /^Faces recognised on/ }),
          400,
        );
        // Off camera: wait until Thomas Kirby's label is really drawn (matches come and go as faces turn).
        await page
          .locator('text')
          .filter({ hasText: 'Thomas Kirby' })
          .first()
          .waitFor({ state: 'visible', timeout: 180_000 })
          .catch(() => process.stdout.write('  recognition: Thomas Kirby not named in 3 min\n'));
      },
      async record(page, m) {
        const overlay = page.getByRole('img', { name: /^Faces recognised on/ });
        const label = page.locator('text').filter({ hasText: 'Thomas Kirby' }).first();
        const named = (): Promise<boolean> => label.isVisible().catch(() => false);
        // Labels come and go as the face turns: open the beat once the name has held for 1 s.
        await m.wait('steady name', async () => {
          for (let held = 0, tries = 0; held < 10 && tries < 600; tries++) {
            held = (await named()) ? held + 1 : 0;
            await page.waitForTimeout(100);
          }
        });
        // The callout points at the steady "Detections live" chip, not at the flickering name.
        await m.shot('named-box', page.getByText('Detections live').first());
        await page.waitForTimeout(400);
        await m.focus(overlay, 'live view', 1.1);
        await page.waitForTimeout(6000);
      },
    },
    {
      id: 'wall',
      async prepare(page) {
        await open(page, '/live-wall');
        await page
          .waitForFunction(
            () => (document.body.innerText.match(/Stream live/g) ?? []).length >= 4,
            undefined,
            {
              timeout: 90_000,
            },
          )
          .catch(() => process.stdout.write('  recognition: not every wall stream went live\n'));
        await settle(page, 800);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('wall', page.getByText('Main Entrance Camera').first());
        await page.waitForTimeout(5000);
      },
    },
  ],
};
