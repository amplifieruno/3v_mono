# Record Demo

Records a video walkthrough of an implemented feature using Playwright.

## When to Use

- After implementing UI changes and passing quality gates
- Before committing and pushing
- **Skip** for non-UI changes (Hasura-only migrations, backend-only, config, docs)

## How It Works

Playwright's `recordVideo` option records the browser session as a `.webm` file. You use the `browser_run_code` MCP tool to create a browser context with recording enabled, perform a walkthrough, then close the context to save the video.

## Step 1: Determine What to Demo

Read the task overview/specs to identify the key user flows. Focus on:
- The primary CRUD operations (create, read, update, delete)
- Navigation to the feature page
- Form submissions and validations
- Any visual feedback (toasts, modals, state changes)

## Step 2: Start Recording and Perform Walkthrough

Use a single `browser_run_code` call to record the entire demo. The video is saved when the context closes.

```javascript
// Via mcp__playwright__browser_run_code:
async (page) => {
  const { chromium } = require('playwright');

  // Create a new context with video recording
  const context = await browser.newContext({
    recordVideo: {
      dir: './playwright-output',
      size: { width: 1280, height: 720 }
    }
  });

  const demoPage = await context.newPage();

  // Navigate to the app
  await demoPage.goto('http://localhost:5173');

  // Wait for app to load
  await demoPage.waitForLoadState('networkidle');

  // --- Login (if required) ---
  // await demoPage.fill('[name="email"]', 'admin@example.com');
  // await demoPage.fill('[name="password"]', 'password');
  // await demoPage.click('button[type="submit"]');
  // await demoPage.waitForLoadState('networkidle');

  // --- Navigate to feature ---
  // await demoPage.click('text=Feature Name');
  // await demoPage.waitForLoadState('networkidle');

  // --- Demonstrate the feature ---
  // Show list page
  // await demoPage.waitForTimeout(2000);

  // Create a new record
  // await demoPage.click('text=Create');
  // await demoPage.fill('[name="field"]', 'Demo Value');
  // await demoPage.click('button[type="submit"]');
  // await demoPage.waitForTimeout(2000);

  // Edit the record
  // await demoPage.click('text=Edit');
  // ...

  // Delete the record
  // await demoPage.click('text=Delete');
  // ...

  // Add pauses between actions so the video is watchable
  await demoPage.waitForTimeout(1000);

  // Close context to save the video
  const video = demoPage.video();
  await context.close();

  // Get the video path
  const videoPath = await video.path();
  return `Demo recorded: ${videoPath}`;
}
```

**Adapt the walkthrough** to your specific feature. The comments above are a template -- replace them with actual selectors and actions for your implemented feature.

## Step 3: Report the Video Path

After recording, output the video file path so the user can review it:

```
Demo video recorded: playwright-output/<filename>.webm
```

Include this path in:
- The task close comment: `bd close <TASK_ID> --comment "Demo: playwright-output/<filename>.webm"`
- The commit message body (optional)

## Tips

- **Add `waitForTimeout(1500-2000)`** between major actions so the video is easy to follow
- **Wait for network idle** after navigation to ensure the page is fully loaded
- **Use descriptive selectors** (`getByRole`, `getByText`) rather than fragile CSS selectors
- **Keep demos under 60 seconds** -- show the key flows, not every edge case
- **If login is required**, include it in the walkthrough; it demonstrates the auth flow too
- **If the feature has no UI**, skip the demo entirely and note "No UI changes -- demo skipped"

## Troubleshooting

- **Video is empty/black**: Ensure you wait for page load before interacting
- **Video not saved**: You must call `context.close()` -- the video is finalized on close
- **Browser not installed**: Run `mcp__playwright__browser_install` first
- **App not running**: Ensure `pnpm run dev` is running before recording
