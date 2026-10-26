import type { RecordedScene } from '../scene';
import { open, settle } from '../session';
import { navTo, openRow, scroll } from '../ui';

/** Scene 8: an erasure request done step by step, retention, system health, built-in help. */
export const privacy: RecordedScene = {
  id: 'privacy',
  beats: [
    {
      id: 'steps',
      async prepare(page) {
        await open(page, '/data-subject-requests');
        await openRow(page, ['Erasure']);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('steps', page.getByRole('tabpanel').getByRole('listitem').first());
        await page.waitForTimeout(4000);
        await scroll(page, m, 400, 2500);
        await page.waitForTimeout(1500);
      },
    },
    {
      id: 'retention',
      prepare: (page) => navTo(page, 'Retention plan'),
      async record(page) {
        await page.waitForTimeout(4000);
      },
    },
    {
      id: 'status',
      prepare: (page) => navTo(page, 'System status'),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('status', page.getByText('Services').first());
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'help',
      async prepare(page) {
        await navTo(page, 'Help');
        const topics = page.getByRole('navigation', { name: 'Topics' });
        await topics.getByRole('button', { name: 'Access decisions', exact: true }).click();
        await settle(page);
      },
      async record(page) {
        await page.waitForTimeout(4000);
      },
    },
  ],
};
