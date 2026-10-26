import type { Locator, Page } from '@playwright/test';
import type { Marks } from './marks';
import { settle } from './session';

const SECTIONS = [
  'Places',
  'Devices',
  'People',
  'Monitoring',
  'Notifications',
  'Analytics',
  'Access',
  'Compliance',
  'Search',
];

/** Clicks a sidebar link, opening its section first when it is collapsed. */
export async function navTo(page: Page, m: Marks, link: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const target = nav.getByRole('link', { name: link, exact: true }).first();
  for (const section of SECTIONS) {
    if (await target.isVisible()) break;
    const button = nav.getByRole('button', { name: section, exact: true });
    if ((await button.count()) && (await button.getAttribute('aria-expanded')) !== 'true') {
      await button.click();
      await page.waitForTimeout(250);
    }
  }
  await m.click(target, link);
  await m.wait('load', () => settle(page));
}

/** Opens the record of the first list row containing every text. */
export async function openRow(
  page: Page,
  m: Marks,
  texts: string[],
  search?: string,
): Promise<void> {
  if (search) {
    await page.getByRole('searchbox').first().pressSequentially(search, { delay: 60 });
    await m.wait('search', () => settle(page));
  }
  let row: Locator = page.getByRole('row');
  for (const text of texts) row = row.filter({ hasText: text });
  await m.click(row.first().getByRole('link').first(), texts.join(' '));
  await m.wait('load', () => settle(page));
}

/** Switches a record tab. */
export async function tab(page: Page, m: Marks, name: string): Promise<void> {
  await m.click(page.getByRole('tab', { name, exact: true }), name);
  await m.wait('load', () => settle(page, 300));
}

/** Scrolls the page smoothly by `dy` px. */
export async function scroll(page: Page, m: Marks, dy: number, ms = 1200): Promise<void> {
  m.scrolled();
  await page.mouse.move(1100, 600);
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
}

/** Scrolls until a heading or element is near the top third of the screen. */
export async function scrollTo(page: Page, m: Marks, loc: Locator, ms = 1200): Promise<void> {
  const box = await loc.boundingBox();
  if (box) await scroll(page, m, box.y - 220, ms);
}
