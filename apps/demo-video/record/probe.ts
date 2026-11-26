import { resolve } from 'node:path';
import { open, openSession } from './session';

/** `tsx record/probe.ts /path ...`: screenshots console pages as the recorder sees them, to out/probe-<n>.png. */
const paths = process.argv.slice(2);
const { browser, page } = await openSession();
try {
  for (const [i, path] of paths.entries()) {
    await open(page, path);
    await page.waitForTimeout(1500);
    const file = resolve(import.meta.dirname, `../out/probe-${i}.png`);
    await page.screenshot({ path: file });
    process.stdout.write(`${path} -> ${file}\n`);
  }
} finally {
  await browser.close();
}
