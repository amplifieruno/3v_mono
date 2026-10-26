import { openSession } from './session';
const { browser, page } = await openSession();
const nav = page.getByRole('navigation', { name: 'Main navigation' });
for (const b of await nav.getByRole('button', { expanded: false }).all()) {
  await b.click().catch(() => {});
  await page.waitForTimeout(150);
}
const links = await nav
  .getByRole('link')
  .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
console.log('nav links', links.length, new Set(links).size);
await browser.close();
