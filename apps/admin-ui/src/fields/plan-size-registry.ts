import type { PlanSize } from './plan-geometry';

/**
 * The image size of the floor plan a mounted plan-space input (`areaShape`, `planPosition`)
 * resolved, by the field's channel. A field validator cannot read what its input loaded
 * (`tasks/ui/buro-gaps.md` G17), so the input publishes the size while it is mounted and
 * the validator reads it on save; with nothing published only the structure is checked.
 */
const sizes = new Map<string, PlanSize>();

/** Publishes `size` for `channel`; the returned function withdraws it (if still the current one). */
export function publishPlanSize(channel: string, size: PlanSize): () => void {
  sizes.set(channel, size);
  return () => {
    if (sizes.get(channel) === size) sizes.delete(channel);
  };
}

/** The size a mounted input published for `channel`, or `null`. */
export function planSizeFor(channel: string): PlanSize | null {
  return sizes.get(channel) ?? null;
}

let next = 0;

/** A fresh channel for one plan-space field declaration (`areaShape#1`). */
export function newPlanChannel(kind: string): string {
  next += 1;
  return `${kind}#${next}`;
}
