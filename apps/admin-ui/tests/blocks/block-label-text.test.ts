import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });

// buro keeps a block's `texts.label` out of its bundle, so the raw key would reach the screen (G92).
it("should not read a block's label through t", () => {
  const readers = sources('src').filter((path) => readFileSync(path, 'utf8').includes("t('label')"));
  expect(readers).toEqual([]);
});
