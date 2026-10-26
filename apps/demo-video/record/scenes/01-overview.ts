import type { RecordedScene } from '../scene';
import { settle } from '../session';

/** Scene 1: the operator workspace, a pass over the sections, the security dashboard. */
export const overview: RecordedScene = {
  id: 'overview',
  start: '/workspace',
  async record(page, m) {
    // The stream player retries every 20 s; wait (sped up in the edit) until every tile is live.
    await m.wait('camera streams', () =>
      page
        .waitForFunction(
          () => {
            const text = document.body.innerText;
            return (text.match(/Stream live/g) ?? []).length >= 4 && !text.includes('Stream down');
          },
          undefined,
          { timeout: 90_000, polling: 500 },
        )
        .catch(() => undefined),
    );
    await m.shot('workspace', page.getByRole('main').getByRole('table').first());
    await page.waitForTimeout(1500);
    for (const section of ['Places', 'Devices', 'People', 'Monitoring']) {
      await m.click(page.getByRole('button', { name: section, exact: true }).first(), section);
      await page.waitForTimeout(700);
    }
    await m.click(page.getByRole('link', { name: 'Dashboard', exact: true }).first(), 'Dashboard');
    await m.wait('load', () => settle(page));
    await m.shot('dashboard', page.getByText('Occupancy now').first());
    await page.waitForTimeout(2500);
  },
};
