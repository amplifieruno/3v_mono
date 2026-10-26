import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "@playwright/test";

export const BASE_URL = process.env.ITAP_URL ?? "http://127.0.0.1:5173";
const EMAIL = "admin@itap.demo";
const BUSY =
  '[aria-busy="true"], .animate-pulse, .animate-spin, [data-slot="skeleton"]';

function seedPassword(): string {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
  const env = readFileSync(
    resolve(import.meta.dirname, "../../backend/.env"),
    "utf8",
  );
  const line = env.split("\n").find((l) => l.startsWith("SEED_PASSWORD="));
  const value = line
    ?.slice("SEED_PASSWORD=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) throw new Error("SEED_PASSWORD is not set in apps/backend/.env");
  return value;
}

/** Waits until the network is quiet and no skeleton or spinner is visible. */
export async function settle(page: Page, extraMs = 600): Promise<void> {
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
  for (let i = 0; i < 40; i++) {
    const busy = await page
      .locator(BUSY)
      .evaluateAll(
        (els) => els.filter((e) => e.getClientRects().length > 0).length,
      );
    if (busy === 0) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(extraMs);
}

/** Signs in again only when the app has sent us to /login (hasura-auth allows 10 sign-ins per 5 min). */
export async function ensureSignedIn(page: Page): Promise<void> {
  const signIn = page.getByRole("button", { name: "Sign in" });
  await Promise.race([
    signIn.waitFor({ timeout: 20_000 }),
    page.getByRole("navigation").first().waitFor({ timeout: 20_000 }),
  ]).catch(() => undefined);
  if (!(await signIn.isVisible())) return;
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(seedPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await settle(page);
}

/** Navigates within the app, signing in if needed, and waits for the page to settle. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(BASE_URL + path);
  await ensureSignedIn(page);
  if (!page.url().startsWith(BASE_URL + path.split("?")[0]))
    await page.goto(BASE_URL + path);
  await settle(page);
}

/** One light-theme 1920x1080 browser, signed in once for the whole run. */
export async function openSession(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("buro-theme", "light");
    } catch {
      // storage blocked: the light color scheme still applies
    }
  });
  const page = await context.newPage();
  await open(page, "/workspace");
  const facility = page.getByRole("combobox", { name: "Facility" });
  if (!(await facility.innerText()).includes("Nova Tower")) {
    await facility.click();
    await page.getByRole("option", { name: "Nova Tower", exact: true }).click();
    await settle(page);
  }
  return { browser, context, page };
}
