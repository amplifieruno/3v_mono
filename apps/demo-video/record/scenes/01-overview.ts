import type { RecordedScene } from "../scene";
import { settle } from "../session";

/** Scene 1: the operator workspace, a pass over the sections, the security dashboard. */
export const overview: RecordedScene = {
  id: "overview",
  start: "/workspace",
  async record(page, m) {
    await page.waitForTimeout(1200);
    m.shot("workspace");
    await page.waitForTimeout(1500);
    for (const section of ["Places", "Devices", "People", "Monitoring"]) {
      await m.click(
        page.getByRole("button", { name: section, exact: true }).first(),
        section,
      );
      await page.waitForTimeout(700);
    }
    await m.click(
      page.getByRole("link", { name: "Dashboard", exact: true }).first(),
      "Dashboard",
    );
    await m.wait("load", () => settle(page));
    m.shot("dashboard");
    await page.waitForTimeout(2500);
  },
};
