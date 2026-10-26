import type { RecordedScene } from '../scene';
import { open, settle } from '../session';

/** Waits until every camera tile is live (the stream player retries every 20 s). */
async function streamsLive(page: import('@playwright/test').Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const text = document.body.innerText;
        return (text.match(/Stream live/g) ?? []).length >= 4 && !text.includes('Stream down');
      },
      undefined,
      { timeout: 90_000, polling: 500 },
    )
    .catch(() => process.stdout.write('  overview: not every stream went live\n'));
}

/** Scene 1: the operator workspace with live cameras, then the dashboard. */
export const overview: RecordedScene = {
  id: 'overview',
  beats: [
    {
      id: 'workspace',
      async prepare(page) {
        await open(page, '/workspace');
        await streamsLive(page);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        const cameras = page.getByText('Lobby Camera').first();
        await m.focus(cameras, 'cameras', 1.15);
        await page.waitForTimeout(1400);
        await m.shot('workspace', page.getByText('Loading Dock Camera').first());
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'dashboard',
      async prepare(page) {
        await open(page, '/dashboard');
        await settle(page, 1000);
      },
      async record(page, m) {
        await page.waitForTimeout(2000);
        await m.shot('dashboard', page.getByText('On site now').first());
        await page.waitForTimeout(4500);
      },
    },
  ],
};
