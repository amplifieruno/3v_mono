import { open, openSession, settle } from './session';

const CAMERAS = [
  'Loading Dock Camera',
  'Server Room Camera',
  'Lobby Camera',
  'Main Entrance Camera',
];
const action = process.argv[2] === 'stop' ? 'Stop recognition' : 'Start recognition';

/** Starts (or, with `stop`, stops) recognition on the four stream cameras through the console. */
const { browser, page } = await openSession();
try {
  for (const camera of CAMERAS) {
    await open(page, '/devices');
    await page.getByRole('searchbox').first().fill(camera);
    await settle(page);
    await page
      .getByRole('row')
      .filter({ hasText: camera })
      .first()
      .getByRole('link')
      .first()
      .click();
    await settle(page);
    const button = page.getByRole('button', { name: action, exact: true }).first();
    if (await button.isVisible()) {
      await button.click();
      await settle(page);
      process.stdout.write(`${action}: ${camera}\n`);
    } else process.stdout.write(`${camera}: already in the requested state\n`);
  }
} finally {
  await browser.close();
}
