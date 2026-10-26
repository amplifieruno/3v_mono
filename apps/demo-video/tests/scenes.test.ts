import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { BANNED, onScreenTexts } from "../src/content-rules";
import { SCENES, totalSeconds } from "../src/scenes";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? filesUnder(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

test("total length is 120–150 s", () => {
  const s = totalSeconds(SCENES);
  expect(s).toBeGreaterThanOrEqual(120);
  expect(s).toBeLessThanOrEqual(150);
});

test("no technology words on screen", () => {
  for (const text of onScreenTexts(SCENES))
    for (const re of BANNED) expect(text).not.toMatch(re);
});

test("the banned list catches a tech word", () => {
  expect(BANNED.some((re) => re.test("Matched with pgvector"))).toBe(true);
  expect(BANNED.some((re) => re.test("5 SQL functions"))).toBe(true);
});

test("two console scenes in a row never share a chapter", () => {
  SCENES.slice(1).forEach((s, i) => {
    const prev = SCENES[i];
    if (s.kind === "console" && prev.kind === "console")
      expect(s.chapter).not.toBe(prev.chapter);
  });
});

test("recording scripts hold no record ids", () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const f of filesUnder("record"))
    expect(readFileSync(f, "utf8")).not.toMatch(uuid);
});
