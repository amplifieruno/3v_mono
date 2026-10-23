import { type Page, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

/** Pages the navigation lists that are not module pages (the docs browser has its own suite). */
const SKIPPED = new Set(['/help']);

/**
 * Every entry of the main navigation, read from the running console (each collapsed section is
 * opened): the navigation is built from the resources and pages the modules register, so this is
 * the console's list of list pages and custom pages.
 */
async function navigationPaths(page: Page): Promise<string[]> {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const read = () => nav.locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  const hrefs = await read();
  const sections = nav.locator('button[aria-expanded]:not([aria-haspopup]):not([role="combobox"])');
  const count = await sections.count();
  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    if ((await section.getAttribute('aria-expanded')) === 'false') await section.click();
    hrefs.push(...(await read()));
  }
  return [...new Set(hrefs)].filter((href) => href !== '' && !SKIPPED.has(href));
}

/*
 * Console-wide smoke over the seeded admin (Nova Tower): every page of the navigation opens with
 * its heading, without an error state (buro's list, record, section and block failures all render
 * `role="alert"`), without an uncaught page error and without a GraphQL error answer.
 */
test.describe('console smoke', () => {
  test('should open every page of the navigation without an error', async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const page = await openSignedIn(browser);
    const problems: string[] = [];
    let current = '';
    page.on('pageerror', (error) => problems.push(`${current}: page error ${error.message}`));
    page.on('response', async (response) => {
      if (!response.url().includes('/v1/graphql') || response.request().method() !== 'POST') return;
      const body = (await response.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
      if (body?.errors !== undefined) problems.push(`${current}: GraphQL ${body.errors.map((e) => e.message).join('; ')}`);
    });
    try {
      const paths = await navigationPaths(page);
      expect(paths.length).toBeGreaterThan(60);
      test.info().annotations.push({ type: 'pages', description: `${paths.length}: ${paths.join(' ')}` });
      for (const path of paths) {
        current = path;
        await page.goto(path);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading', { level: 1 }).first(), path).toBeVisible({ timeout: 20_000 });
        // Lists and blocks settle (a skeleton or "Loading" goes away) before the check.
        await expect(main.locator('[aria-busy="true"]'), path).toHaveCount(0, { timeout: 15_000 });
        const alerts = await main.getByRole('alert').allTextContents();
        if (alerts.length > 0) problems.push(`${path}: alert ${alerts.join(' | ')}`);
      }
      expect(problems).toEqual([]);
    } finally {
      await page.context().close();
    }
  });
});
