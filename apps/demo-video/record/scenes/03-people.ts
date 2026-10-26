import type { RecordedScene } from '../scene';
import { openRow, scroll, tab } from '../ui';

/** Scene 3: faces seen today, one person's photos and their day as a timeline (Thomas Kirby is IDENTITY-00003 in the seed). */
export const people: RecordedScene = {
  id: 'people',
  // The "Seen by cameras" view: identities seen at least once, latest first (no ids, survives re-seeds).
  start:
    '/identities?identity.filters=eyJ2IjoyLCJwIjpbeyJmaWVsZCI6Imxhc3Rfc2Vlbl9hdCIsIm9wIjoiaXNOb3ROdWxsIn1dLCJnIjp7ImpvaW4iOiJhbmQiLCJyb3dzIjpbXX19' +
    '&identity.sort=eyJ2IjoxLCJzb3J0IjpbeyJkaXJlY3Rpb24iOiJkZXNjIiwiZmllbGQiOiJsYXN0X3NlZW5fYXQifV19',
  async record(page, m) {
    await m.shot('faces', page.getByRole('row').nth(1).getByRole('img').first());
    await page.waitForTimeout(2500);
    await openRow(page, m, ['IDENTITY-00003'], 'IDENTITY-00003');
    await tab(page, m, 'Photos');
    await m.shot('photos', page.getByRole('tabpanel').getByRole('img').first());
    await page.waitForTimeout(2500);
    await tab(page, m, 'Timeline');
    await m.shot('timeline', page.getByRole('tabpanel').getByRole('listitem').first());
    await page.waitForTimeout(1500);
    await scroll(page, m, 500, 2500);
    await page.waitForTimeout(1000);
  },
};
