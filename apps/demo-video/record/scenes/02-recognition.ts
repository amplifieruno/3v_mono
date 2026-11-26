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
        // Every tile playing: as many LIVE marks as tiles (a stream that hiccups is tried again within seconds).
        await page
          .waitForFunction(
            () => {
              const tiles = [...document.querySelectorAll('[data-testid="wall-tile"]')];
              return tiles.length >= 9 && tiles.every((t) => /\bLive\b/.test(t.textContent ?? ''));
            },
            undefined,
            { timeout: 120_000, polling: 500 },
          )
          .catch(() => process.stdout.write('  recognition: not every wall stream went live\n'));
        await settle(page, 800);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        // Hold until a camera lights up with a fresh alert (restricted areas raise them every minute or
        // so), so its red ring lasts the whole beat.
        await m.wait('alert', () =>
          page
            .waitForFunction(
              () =>
                [...document.querySelectorAll('[data-alert-at]')].some(
                  (t) => Date.now() - Number(t.getAttribute('data-alert-at')) < 8000,
                ),
              undefined,
              { timeout: 120_000, polling: 250 },
            )
            .catch(() => process.stdout.write('  recognition: no fresh alert in 2 min\n')),
        );
        const lit = page.locator('[data-alert="true"]').first();
        await m.shot('wall', (await lit.count()) > 0 ? lit : page.getByTestId('wall-tile').first());
        await page.waitForTimeout(6000);
      },
    },
  ],
};
