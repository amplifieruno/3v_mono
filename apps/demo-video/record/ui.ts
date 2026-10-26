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

/** Off camera: clicks a sidebar link, opening its section first when it is collapsed. */
export async function navTo(page: Page, link: string): Promise<void> {
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
  await target.click();
  await settle(page);
}

/** Off camera: opens the record of the first list row containing every text. */
export async function openRow(page: Page, texts: string[], search?: string): Promise<void> {
  if (search) {
    await page.getByRole('searchbox').first().fill(search);
    await settle(page);
  }
  let row: Locator = page.getByRole('row');
  for (const text of texts) row = row.filter({ hasText: text });
  await row.first().getByRole('link').first().click();
  await settle(page);
}

/** Off camera: switches a record tab. */
export async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
  await settle(page, 300);
}

/** Off camera: turns a list's auto-refresh off, so rows stay put under a callout. */
export async function autoRefreshOff(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Auto-refresh: on' });
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
}

/** Scrolls smoothly by `dy` px; on camera, pass the marks so open callouts end first. */
export async function scroll(
  page: Page,
  m: Marks | undefined,
  dy: number,
  ms = 1200,
): Promise<void> {
  m?.scrolled();
  await page.mouse.move(1100, 600);
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
}

/** Scrolls until an element sits about 200 px below the top. */
export async function scrollTo(
  page: Page,
  m: Marks | undefined,
  loc: Locator,
  ms = 1200,
): Promise<void> {
  const box = await loc.first().boundingBox();
  if (box) await scroll(page, m, box.y - 200, ms);
}
