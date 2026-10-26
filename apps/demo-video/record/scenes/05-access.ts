import type { RecordedScene } from '../scene';
import { navTo, openRow } from '../ui';

/** Scene 5: live access decisions, why one door said no, and the policy picture. */
export const access: RecordedScene = {
  id: 'access',
  start: '/access-decisions',
  async record(page, m) {
    await m.shot('list');
    await page.waitForTimeout(2500);
    await openRow(page, m, ['Denied', 'Thomas Kirby']);
    await m.focus(page.getByText('Policy versions in force', { exact: false }).first(), 'policies');
    await m.shot('trace', page.getByRole('cell', { name: 'Deny', exact: true }));
    await page.waitForTimeout(4000);
    await navTo(page, m, 'Policy analytics');
    await m.shot('policies', page.getByText('Why doors', { exact: false }));
    await page.waitForTimeout(3500);
  },
};
