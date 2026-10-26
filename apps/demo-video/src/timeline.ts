import { Easing } from 'remotion';

/** A box in CSS px of the 1920x1080 page. */
export type Box = { x: number; y: number; w: number; h: number };

/** A moment the recording script marked; `t` is seconds from the clip start. */
export type Mark =
  | { t: number; type: 'click' | 'focus'; box: Box; label?: string; zoom?: number }
  | { t: number; type: 'wait_start' | 'wait_end'; reason?: string }
  | { t: number; type: 'shot'; name: string; box?: Box }
  | { t: number; type: 'scroll' };

export type Timeline = { clip: string; duration: number; marks: Mark[] };

/** A stretch of source seconds played at `rate`. */
export type Segment = { from: number; to: number; rate: number };

export type Camera = { scale: number; cx: number; cy: number };

const PAGE_W = 1920;
const PAGE_H = 1080;
/** Clicks get a short gentle push-in; deliberate focus marks a closer, longer look. */
const LOOK = { click: { zoom: 1.3, hold: 0.8 }, focus: { zoom: 1.6, hold: 2.5 } } as const;
const LEAD = 0.3;
const MOVE = 0.6;
const REST: Camera = { scale: 1, cx: PAGE_W / 2, cy: PAGE_H / 2 };
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/** Merged wait spans, a missing `wait_end` closing at the clip end. */
function waitSpans(tl: Timeline): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let start = 0;
  for (const m of [...tl.marks].sort((a, b) => a.t - b.t)) {
    if (m.type === 'wait_start' && depth++ === 0) start = m.t;
    if (m.type === 'wait_end' && depth > 0 && --depth === 0) spans.push([start, m.t]);
  }
  if (depth > 0) spans.push([start, tl.duration]);
  return spans.filter(([a, b]) => b > a);
}

/** Cuts the clip into normal and sped-up stretches; waits play at `waitRate`, never longer than `maxWait` of output. */
export function planSegments(
  tl: Timeline,
  opts: { waitRate?: number; maxWait?: number } = {},
): Segment[] {
  const waitRate = opts.waitRate ?? 6;
  const maxWait = opts.maxWait ?? 8;
  const segs: Segment[] = [];
  let cursor = 0;
  for (const [a, b] of waitSpans(tl)) {
    if (a > cursor) segs.push({ from: cursor, to: a, rate: 1 });
    segs.push({ from: a, to: b, rate: Math.max(waitRate, (b - a) / maxWait) });
    cursor = b;
  }
  if (cursor < tl.duration) segs.push({ from: cursor, to: tl.duration, rate: 1 });
  return segs;
}

export function outputDuration(segs: Segment[]): number {
  return segs.reduce((sum, s) => sum + (s.to - s.from) / s.rate, 0);
}

/** The source second shown at `outSeconds` of output. */
export function sourceTimeAt(segs: Segment[], outSeconds: number): number {
  let out = 0;
  for (const s of segs) {
    const len = (s.to - s.from) / s.rate;
    if (outSeconds <= out + len) return s.from + (outSeconds - out) * s.rate;
    out += len;
  }
  return segs.at(-1)?.to ?? 0;
}

function aim(box: Box, zoom: number): Camera {
  const halfW = PAGE_W / zoom / 2;
  const halfH = PAGE_H / zoom / 2;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return {
    scale: zoom,
    cx: clamp(box.x + box.w / 2, halfW, PAGE_W - halfW),
    cy: clamp(box.y + box.h / 2, halfH, PAGE_H - halfH),
  };
}

function mix(a: Camera, b: Camera, p: number): Camera {
  const k = ease(Math.min(1, Math.max(0, p)));
  return {
    scale: a.scale + (b.scale - a.scale) * k,
    cx: a.cx + (b.cx - a.cx) * k,
    cy: a.cy + (b.cy - a.cy) * k,
  };
}

type Aim = { start: number; end: number; cam: Camera };

/** Camera windows: each click/focus pulls the camera from LEAD before it, holds for its look or until the next one. */
function aims(tl: Timeline): Aim[] {
  const targets = tl.marks
    .filter((m): m is Extract<Mark, { box: Box }> => m.type === 'click' || m.type === 'focus')
    .sort((a, b) => a.t - b.t);
  return targets.map((m, i) => {
    const start = m.t - LEAD;
    const next = targets[i + 1];
    const look = LOOK[m.type];
    const end = Math.min(m.t + look.hold, next ? next.t - LEAD : Infinity);
    return { start, end, cam: aim(m.box, m.zoom ?? look.zoom) };
  });
}

/** The camera inside one aim's window: move from `from`, hold, then ease back to rest. */
function regime(a: Aim, from: Camera, s: number): Camera {
  if (s < a.start + MOVE) return mix(from, a.cam, (s - a.start) / MOVE);
  if (s < a.end) return a.cam;
  return mix(a.cam, REST, (s - a.end) / MOVE);
}

/** Where the camera looks at `sourceSeconds`. Each move starts from wherever the camera is, so it never jumps. */
export function cameraAt(tl: Timeline, sourceSeconds: number): Camera {
  const list = aims(tl);
  let from = REST;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (sourceSeconds < a.start) return from;
    const next = list[i + 1];
    if (!next || sourceSeconds < next.start) return regime(a, from, sourceSeconds);
    from = regime(a, from, next.start);
  }
  return from;
}

/** The output second at which source second `sourceSeconds` is shown. */
export function outputTimeAt(segs: Segment[], sourceSeconds: number): number {
  let out = 0;
  for (const s of segs) {
    if (sourceSeconds <= s.to) return out + Math.max(0, sourceSeconds - s.from) / s.rate;
    out += (s.to - s.from) / s.rate;
  }
  return out;
}

/** Plays every segment `k` times faster (fits a clip into its scene). */
export function scaleSegments(segs: Segment[], k: number): Segment[] {
  return segs.map((s) => ({ ...s, rate: s.rate * k }));
}

/** Where a page point lands on the 1920x1080 view through the camera. */
export function toScreen(cam: Camera, p: { x: number; y: number }): { x: number; y: number } {
  return { x: PAGE_W / 2 + (p.x - cam.cx) * cam.scale, y: PAGE_H / 2 + (p.y - cam.cy) * cam.scale };
}

/** A named moment and, when the script gave one, the box of what it is about. */
export function shotOf(
  tl: Timeline,
  name: string,
): { t: number; box: Box | undefined } | undefined {
  const m = tl.marks.find(
    (x): x is Extract<Mark, { type: 'shot' }> => x.type === 'shot' && x.name === name,
  );
  return m && { t: m.t, box: m.box };
}

/** Output seconds [start, end] a callout on shot `name` is on screen: from just after the shot until the next shot or scroll, at most 3.5 s, and 0.4 s before the scene ends. */
export function calloutWindow(
  tl: Timeline,
  segs: Segment[],
  name: string,
  sceneSeconds: number,
): [number, number] | undefined {
  const shot = shotOf(tl, name);
  if (!shot) return undefined;
  const start = outputTimeAt(segs, shot.t) + 0.3;
  const next = tl.marks
    .filter((m) => (m.type === 'shot' || m.type === 'scroll') && m.t > shot.t)
    .reduce((min, m) => Math.min(min, m.t), Infinity);
  const nextOut = next === Infinity ? Infinity : outputTimeAt(segs, next);
  const end = Math.min(start + 3.5, nextOut, sceneSeconds - 0.4);
  return [Math.round(start * 1000) / 1000, Math.round(end * 1000) / 1000];
}

/** How much faster (or, a little, slower) a clip of `outSeconds` plays to fill `availSeconds`. */
export function fitRate(outSeconds: number, availSeconds: number): number {
  return Math.max(0.85, outSeconds / availSeconds);
}
