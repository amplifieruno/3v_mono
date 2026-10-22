import { type Page, type Request, expect, test } from '@playwright/test';
import { devStackEnabled, openSignedIn } from './dev-stack';

test.skip(!devStackEnabled, 'needs the dev stack and seed (ITAP_DEV_STACK=1)');

const RUN = `e2e-${Date.now()}`;
const SENSOR = `${RUN} Sensor`;
/** A seeded camera with a live stream (cameras are seeded with recognition off). */
const CAMERA = 'Lobby Camera';
const INSIGHTFACE_URL = process.env.INSIGHTFACE_URL ?? 'http://127.0.0.1:18080';

/*
 * One browser page for the whole flow, opened from the run's shared admin session. The run
 * creates a sensor and removes it, and starts recognition on a seeded camera; it reads the
 * camera's `recognition_enabled` first and puts exactly that state back after each step that
 * changes it and in the afterAll sweep (the dev stack is shared).
 */
test.describe.serial('devices smoke', () => {
  let page: Page;
  /** Whether beforeAll got as far as opening the page (afterAll has nothing to clean otherwise). */
  let opened = false;
  let cameraId = '';
  let facilityId = '';
  /** The camera's `recognition_enabled` before the run; restored after every step that changes it. */
  let recognitionBefore: boolean | undefined;
  /** GraphQL mutations the page sent, as `{ query, variables }` text. */
  const mutations: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await openSignedIn(browser);
    opened = true;
    page.on('request', (request: Request) => {
      if (request.method() !== 'POST' || !request.url().includes('/v1/graphql')) return;
      const body = request.postData() ?? '';
      if (body.includes('mutation')) mutations.push(body);
    });
    const camera = await graphql<{
      devices: { id: string; facility_id: string; recognition_enabled: boolean }[];
    }>('query ($n: String!) { devices(where: {name: {_eq: $n}}) { id facility_id recognition_enabled } }', {
      n: CAMERA,
    });
    cameraId = camera.devices[0]?.id ?? '';
    facilityId = camera.devices[0]?.facility_id ?? '';
    recognitionBefore = camera.devices[0]?.recognition_enabled;
    if (cameraId === '') throw new Error(`${CAMERA} is not seeded`);
  });

  test.afterAll(async () => {
    // beforeAll may have failed before the page or the camera was read: clean only what exists.
    if (!opened) return;
    try {
      await restoreRecognition();
      await graphql('mutation ($m: String!) { delete_devices(where: {name: {_like: $m}}) { affected_rows } }', {
        m: `${RUN}%`,
      });
    } finally {
      await page.context().close();
    }
  });

  /** Runs one GraphQL operation with the stored organization token (setup, check and restore steps). */
  async function graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return page.evaluate(
      async ({ q, v }) => {
        const stored = JSON.parse(localStorage.getItem('itap:auth:v1') ?? '{}') as {
          org?: { accessToken: string };
        };
        const response = await fetch('/v1/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${stored.org?.accessToken ?? ''}`,
          },
          body: JSON.stringify({ query: q, variables: v }),
        });
        const body = (await response.json()) as { data?: unknown; errors?: unknown };
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        return body.data as T;
      },
      { q: query, v: variables },
    );
  }

  /**
   * Puts the camera's recognition back as it was before the run (started or stopped through the
   * same actions the console uses); never throws. Nothing to do when the camera was never read.
   */
  async function restoreRecognition(): Promise<void> {
    if (cameraId === '' || recognitionBefore === undefined) return;
    const action = recognitionBefore ? 'recognition_start' : 'recognition_stop';
    try {
      await graphql(`mutation ($id: uuid!) { ${action}(device_id: $id) { running } }`, {
        id: cameraId,
      });
    } catch {
      // Already in that state, or the stack is down: nothing to clean.
    }
  }

  /** Stops recognition on the camera (a step that needs it off); never throws. */
  async function stopRecognition(): Promise<void> {
    try {
      await graphql('mutation ($id: uuid!) { recognition_stop(device_id: $id) { running } }', {
        id: cameraId,
      });
    } catch {
      // Already stopped, or the stack is down.
    }
  }

  /** Confirms an action's dialog when the action asks for one (it opens a moment after the click). */
  async function confirmIfAsked(name: string): Promise<void> {
    const confirm = page.getByRole('dialog').getByRole('button', { name, exact: true });
    try {
      await confirm.waitFor({ state: 'visible', timeout: 2_000 });
    } catch {
      return;
    }
    await confirm.click();
  }

  async function insightfaceUp(): Promise<boolean> {
    try {
      const response = await fetch(`${INSIGHTFACE_URL}/info`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  test('should create a sensor, edit it without a password and then with one', async () => {
    await page.goto(`/devices/create?type=sensor&prefill.facility_id=${facilityId}`);
    await page.getByTestId('form-field-input:device:create:name').fill(SENSOR);
    await page.getByTestId('form-submit:device:create').click();
    await expect(page).toHaveURL(/\/devices\/[0-9a-f-]{36}$/);
    await expect(page.getByText(SENSOR).first()).toBeVisible();
    const id = page.url().split('/').pop() ?? '';

    // Edit without touching the password: the request must not carry one.
    mutations.length = 0;
    await page.goto(`/devices/${id}/edit`);
    await page.getByTestId('form-field-input:device:edit:model').fill('S-100');
    await page.getByTestId('form-submit:device:edit').click();
    await expect(page).toHaveURL(new RegExp(`/devices/${id}$`));
    await expect(page.getByText('S-100').first()).toBeVisible();
    const withoutPassword = mutations.filter((body) => body.includes('S-100'));
    expect(withoutPassword.length).toBeGreaterThan(0);
    for (const body of withoutPassword) expect(body).not.toContain('password');

    // Edit with a new password: it is sent.
    mutations.length = 0;
    await page.goto(`/devices/${id}/edit`);
    await page.getByTestId('form-field-input:device:edit:password').fill('s3cret-pass');
    await page.getByTestId('form-submit:device:edit').click();
    await expect(page).toHaveURL(new RegExp(`/devices/${id}$`));
    expect(mutations.some((body) => body.includes('s3cret-pass'))).toBe(true);
    // It is never shown back.
    await expect(page.getByText('s3cret-pass')).toHaveCount(0);

    // Remove the stored password: the request carries null and the server accepts it.
    mutations.length = 0;
    await page.goto(`/devices/${id}/edit`);
    await page.getByTestId('form-field-input:device:edit:password:remove').click();
    await expect(page.getByText('The stored value is removed on save.')).toBeVisible();
    await page.getByTestId('form-submit:device:edit').click();
    await expect(page).toHaveURL(new RegExp(`/devices/${id}$`));
    expect(mutations.some((body) => /"password":null/u.test(body))).toBe(true);
  });

  test('should delete the sensor from the list', async () => {
    await page.goto('/devices');
    await page
      .getByPlaceholder(/search/i)
      .first()
      .fill(SENSOR);
    const row = page.getByRole('row', { name: new RegExp(SENSOR) });
    await expect(row).toHaveCount(1);
    await row.getByTestId(/^list-row-actions-menu:device:/).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: new RegExp(SENSOR) })).toHaveCount(0);
  });

  test('should show the health chart or its empty state on the Health tab', async () => {
    await page.goto(`/devices/${cameraId}`);
    await page.getByRole('tab', { name: 'Health' }).click();
    await expect(page.getByTestId('health-chart').first()).toBeVisible();
  });

  test('should start recognition, show its figures and the Stop button, then stop it', async () => {
    await stopRecognition();
    try {
      await page.goto(`/devices/${cameraId}`);
      await page.getByTestId('form-action:device:show:start_recognition').click();
      await confirmIfAsked('Start recognition');
      await expect(page.getByTestId('form-action:device:show:stop_recognition')).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('Frames analysed').first()).toBeVisible();
      await expect(page.getByText('Running now').first()).toBeVisible();

      await page.getByTestId('form-action:device:show:stop_recognition').click();
      await confirmIfAsked('Stop recognition');
      await expect(page.getByTestId('form-action:device:show:start_recognition')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await restoreRecognition();
    }
  });

  test('should play the live view or say the stream is unavailable, and box a face when recognition runs', async () => {
    const withInsightface = await insightfaceUp();
    test.info().annotations.push({
      type: 'note',
      description: withInsightface
        ? 'insightface up: detection box expected'
        : 'insightface down: detection box step skipped',
    });
    try {
      if (withInsightface) {
        await graphql('mutation ($id: uuid!) { recognition_start(device_id: $id) { running } }', {
          id: cameraId,
        });
      }
      await page.goto(`/devices/${cameraId}`);
      await page.getByRole('tab', { name: 'Live' }).click();
      const live = page.getByTestId('live-camera');
      await expect(live).toBeVisible();
      const video = live.locator('video');
      const unavailable = live.getByText('Stream unavailable');
      await expect(async () => {
        const playing = await video.evaluate(
          (el: HTMLVideoElement) => !el.paused && el.readyState >= 2 && el.currentTime > 0,
        );
        expect(playing || (await unavailable.isVisible())).toBe(true);
      }).toPass({ timeout: 30_000 });
      if (withInsightface) {
        await expect(live.getByTestId('live-box').first()).toBeVisible({ timeout: 25_000 });
      }
    } finally {
      await restoreRecognition();
    }
  });

  test('should show a camera running recognition on the live wall', async () => {
    try {
      await graphql('mutation ($id: uuid!) { recognition_start(device_id: $id) { running } }', {
        id: cameraId,
      });
      await page.goto('/live-wall');
      const wall = page.getByTestId('live-wall');
      await expect(wall).toBeVisible();
      await expect(wall.getByRole('link', { name: CAMERA })).toBeVisible();
      await expect(wall.getByTestId('live-camera').first()).toBeVisible();

      // Stopped, it leaves the wall (other cameras may still run recognition on the shared stack).
      await stopRecognition();
      await page.reload();
      await expect(
        page
          .getByTestId('live-wall')
          .or(page.getByText(/no camera/i))
          .first(),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: CAMERA })).toHaveCount(0);
    } finally {
      await restoreRecognition();
    }
  });
});
