import type { RecordedScene } from '../scene';
import { open, settle } from '../session';
import { openRow } from '../ui';

/** Scene 8: an erasure request done step by step, retention, built-in help. */
export const privacy: RecordedScene = {
  id: 'privacy',
  beats: [
    {
      id: 'steps',
      async prepare(page) {
        await open(page, '/data-subject-requests');
        await openRow(page, ['Erasure']);
        // The steps that carry the story (faces deleted, profile replaced, completed) sit at the end of the list.
        await page
          .getByText('Profile replaced by', { exact: false })
          .first()
          .evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(400);
      },
      async record(page, m) {
        await page.waitForTimeout(1200);
        const faces = page.getByText('Photos and face templates deleted', { exact: false }).first();
        await m.focus(faces, 'erased');
        await page.waitForTimeout(1500);
        await m.shot('steps', faces);
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'retention',
      prepare: (page) => open(page, '/retention-plan'),
      async record(page) {
        await page.waitForTimeout(4000);
      },
    },
    {
      id: 'help',
      async prepare(page) {
        await open(page, '/help');
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
