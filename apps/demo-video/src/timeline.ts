import { Easing } from "remotion";

/** A box in CSS px of the 1920x1080 page. */
export type Box = { x: number; y: number; w: number; h: number };

/** A moment the recording script marked; `t` is seconds from the clip start. */
export type Mark =
  | { t: number; type: "click" | "focus"; box: Box; label?: string }
  | { t: number; type: "wait_start" | "wait_end"; reason?: string }
  | { t: number; type: "shot"; name: string };

export type Timeline = { clip: string; duration: number; marks: Mark[] };

/** A stretch of source seconds played at `rate`. */
export type Segment = { from: number; to: number; rate: number };

export type Camera = { scale: number; cx: number; cy: number };

const PAGE_W = 1920;
const PAGE_H = 1080;
const ZOOM = 1.6;
const LEAD = 0.3;
const MOVE = 0.6;
const HOLD = 2.5;
const REST: Camera = { scale: 1, cx: PAGE_W / 2, cy: PAGE_H / 2 };
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/** Merged wait spans, a missing `wait_end` closing at the clip end. */
function waitSpans(tl: Timeline): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let start = 0;
  for (const m of [...tl.marks].sort((a, b) => a.t - b.t)) {
    if (m.type === "wait_start" && depth++ === 0) start = m.t;
    if (m.type === "wait_end" && depth > 0 && --depth === 0)
      spans.push([start, m.t]);
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
  if (cursor < tl.duration)
    segs.push({ from: cursor, to: tl.duration, rate: 1 });
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

function aim(box: Box): Camera {
  const halfW = PAGE_W / ZOOM / 2;
  const halfH = PAGE_H / ZOOM / 2;
  const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, v));
  return {
    scale: ZOOM,
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

/** Camera windows: each click/focus pulls the camera from LEAD before it, holds up to HOLD or the next one. */
function aims(tl: Timeline): Aim[] {
  const targets = tl.marks
    .filter(
      (m): m is Extract<Mark, { box: Box }> =>
        m.type === "click" || m.type === "focus",
    )
    .sort((a, b) => a.t - b.t);
  return targets.map((m, i) => {
    const start = m.t - LEAD;
    const next = targets[i + 1];
    const end = Math.min(m.t + HOLD, next ? next.t - LEAD : Infinity);
    return { start, end, cam: aim(m.box) };
  });
}

/** Where the camera looks at `sourceSeconds`: rest, moving to a target, holding, or easing back. */
export function cameraAt(tl: Timeline, sourceSeconds: number): Camera {
  let cam = REST;
  for (const a of aims(tl)) {
    if (sourceSeconds < a.start) return cam;
    const from = cam;
    if (sourceSeconds < a.start + MOVE)
      return mix(from, a.cam, (sourceSeconds - a.start) / MOVE);
    if (sourceSeconds < a.end) return a.cam;
    cam = mix(a.cam, REST, (sourceSeconds - a.end) / MOVE);
    if (sourceSeconds < a.end + MOVE) return cam;
    cam = REST;
  }
  return cam;
}
