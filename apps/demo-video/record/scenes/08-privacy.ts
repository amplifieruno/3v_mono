import type { RecordedScene } from '../scene';
import { navTo, openRow, scroll } from '../ui';
import { settle } from '../session';

/** Scene 8: an erasure request done step by step, retention, system health, built-in help. */
export const privacy: RecordedScene = {
  id: 'privacy',
  start: '/data-subject-requests',
  async record(page, m) {
    await openRow(page, m, ['Erasure']);
    await m.shot('steps', page.getByRole('tabpanel').getByRole('listitem').first());
    await page.waitForTimeout(1200);
    await scroll(page, m, 450, 2000);
    await page.waitForTimeout(800);
    await navTo(page, m, 'Retention plan');
    await m.shot('retention');
    await page.waitForTimeout(2500);
    await navTo(page, m, 'System status');
    await m.shot('status', page.getByText('Services').first());
    await page.waitForTimeout(2500);
    await navTo(page, m, 'Help');
    const topics = page.getByRole('navigation', { name: 'Topics' });
    await m.click(
      topics.getByRole('button', { name: 'Access decisions', exact: true }),
      'help article',
    );
    await m.wait('load', () => settle(page));
    await m.shot('help');
    await page.waitForTimeout(2500);
  },
};
