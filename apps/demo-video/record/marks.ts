import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import type { Box, Mark, Timeline } from '../src/timeline';

/** Writes what happened when during a recording, so the edit can cut waits and aim the camera. */
export class Marks {
  private readonly marks: Mark[] = [];
  private t0 = 0;

  constructor(private readonly scene: string) {}

  start(): void {
    this.t0 = performance.now();
  }

  private now(): number {
    return (performance.now() - this.t0) / 1000;
  }

  private async boxOf(loc: Locator, scroll = true): Promise<Box> {
    if (scroll) await loc.scrollIntoViewIfNeeded({ timeout: 5_000 });
    const b = await loc.boundingBox();
    if (!b) throw new Error(`${this.scene}: element has no box`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Marks the element, lets the camera arrive, then clicks it. */
  async click(loc: Locator, label?: string): Promise<void> {
    this.marks.push({
      t: this.now(),
      type: 'click',
      box: await this.boxOf(loc),
      label,
    });
    await loc.page().waitForTimeout(400);
    await loc.click();
  }

  /** Points the camera at an element without clicking; `zoom` overrides the default closer look. */
  async focus(loc: Locator, label?: string, zoom?: number): Promise<void> {
    this.marks.push({
      t: this.now(),
      type: 'focus',
      box: await this.boxOf(loc),
      label,
      zoom,
    });
  }

  /** The page is about to scroll: open callouts end here. */
  scrolled(): void {
    this.marks.push({ t: this.now(), type: 'scroll' });
  }

  /** Runs `fn` as a wait the edit speeds up. */
  async wait<T>(reason: string, fn: () => Promise<T>): Promise<T> {
    this.marks.push({ t: this.now(), type: 'wait_start', reason });
    try {
      return await fn();
    } finally {
      this.marks.push({ t: this.now(), type: 'wait_end' });
    }
  }

  /** A named moment callouts can attach to; with `loc`, callouts point at that element. */
  async shot(name: string, loc?: Locator): Promise<void> {
    const box = loc ? await this.boxOf(loc.first(), false).catch(() => undefined) : undefined;
    this.marks.push({ t: this.now(), type: 'shot', name, box });
  }

  async save(dir: string, duration: number): Promise<Timeline> {
    const timeline: Timeline = {
      clip: this.scene,
      duration,
      marks: this.marks,
    };
    await writeFile(join(dir, `${this.scene}.timeline.json`), JSON.stringify(timeline, null, 2));
    return timeline;
  }
}
