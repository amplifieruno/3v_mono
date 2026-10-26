import type { RecordedScene } from '../scene';
import { open } from '../session';
import { openRow, scroll, tab } from '../ui';

// The "Seen by cameras" view: identities seen at least once, latest first (no ids, survives re-seeds).
const SEEN =
  '/identities?identity.filters=eyJ2IjoyLCJwIjpbeyJmaWVsZCI6Imxhc3Rfc2Vlbl9hdCIsIm9wIjoiaXNOb3ROdWxsIn1dLCJnIjp7ImpvaW4iOiJhbmQiLCJyb3dzIjpbXX19' +
  '&identity.sort=eyJ2IjoxLCJzb3J0IjpbeyJkaXJlY3Rpb24iOiJkZXNjIiwiZmllbGQiOiJsYXN0X3NlZW5fYXQifV19';
// Thomas Kirby is IDENTITY-00003 in the seed; today's unknown visitors fill the first page of the list.
const KIRBY = 'IDENTITY-00003';

/** Scene 3: faces seen today, one person's photos, and their day as a timeline. */
export const people: RecordedScene = {
  id: 'people',
  beats: [
    {
      id: 'faces',
      prepare: (page) => open(page, SEEN),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('faces', page.getByRole('row').nth(1).getByRole('img').first());
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'photos',
      async prepare(page) {
        await open(page, '/identities');
        await openRow(page, [KIRBY], KIRBY);
        await tab(page, 'Photos');
      },
      async record(page, m) {
        await page.waitForTimeout(1200);
        await m.focus(page.getByRole('tabpanel').first(), 'gallery', 1.15);
        await page.waitForTimeout(1400);
        await m.shot('photos', page.getByRole('tabpanel').getByRole('img').first());
        await page.waitForTimeout(4000);
      },
    },
    {
      id: 'timeline',
      prepare: (page) => tab(page, 'Timeline'),
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.shot('timeline', page.getByRole('tabpanel').getByRole('listitem').first());
        await page.waitForTimeout(4000);
        await scroll(page, m, 450, 3000);
        await page.waitForTimeout(1500);
      },
    },
  ],
};
