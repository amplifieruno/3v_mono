import type { RecordedScene } from '../scene';
import { open } from '../session';
import { autoRefreshOff, navTo, openRow } from '../ui';

/** Scene 5: live access decisions, why one door said no, and the policy picture. */
export const access: RecordedScene = {
  id: 'access',
  beats: [
    {
      id: 'list',
      async prepare(page) {
        await open(page, '/access-decisions');
        await autoRefreshOff(page);
      },
      async record(page) {
        await page.waitForTimeout(4000);
      },
    },
    {
      id: 'trace',
      prepare: (page) => openRow(page, ['Denied', 'Thomas Kirby']),
      async record(page, m) {
        await page.waitForTimeout(1500);
        const deny = page.getByRole('cell', { name: 'Deny', exact: true }).first();
        await m.focus(deny, 'deny', 1.2);
        await page.waitForTimeout(1500);
        await m.shot('trace', deny);
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'policies',
      prepare: (page) => navTo(page, 'Policy analytics'),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('policies', page.getByText('Why doors', { exact: false }).first());
        await page.waitForTimeout(4500);
      },
    },
  ],
};
