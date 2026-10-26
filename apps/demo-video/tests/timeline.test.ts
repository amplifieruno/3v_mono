import { expect, test } from "vitest";
import {
  cameraAt,
  type Mark,
  outputDuration,
  planSegments,
  sourceTimeAt,
  type Timeline,
} from "../src/timeline";

const tl = (marks: Mark[], duration = 20): Timeline => ({
  clip: "x",
  duration,
  marks,
});

test("no waits: one segment at rate 1", () => {
  expect(planSegments(tl([]))).toEqual([{ from: 0, to: 20, rate: 1 }]);
});

test("a 3 s wait is sped up 6x", () => {
  const s = planSegments(
    tl([
      { t: 5, type: "wait_start" },
      { t: 8, type: "wait_end" },
    ]),
  );
  expect(s).toEqual([
    { from: 0, to: 5, rate: 1 },
    { from: 5, to: 8, rate: 6 },
    { from: 8, to: 20, rate: 1 },
  ]);
  expect(outputDuration(s)).toBeCloseTo(17.5);
});

test("a wait still longer than maxWait after speeding is cut to maxWait of output", () => {
  const s = planSegments(
    tl(
      [
        { t: 0, type: "wait_start" },
        { t: 100, type: "wait_end" },
      ],
      110,
    ),
  );
  expect(s[0]).toEqual({ from: 0, to: 100, rate: 12.5 });
  expect(outputDuration(s)).toBeCloseTo(18);
});

test("unterminated wait closes at clip end", () => {
  expect(planSegments(tl([{ t: 15, type: "wait_start" }])).at(-1)).toEqual({
    from: 15,
    to: 20,
    rate: 6,
  });
});

test("overlapping waits merge", () => {
  const s = planSegments(
    tl([
      { t: 2, type: "wait_start" },
      { t: 3, type: "wait_start" },
      { t: 4, type: "wait_end" },
      { t: 6, type: "wait_end" },
    ]),
  );
  expect(s.filter((x) => x.rate > 1)).toEqual([{ from: 2, to: 6, rate: 6 }]);
});

test("segments tile the clip without gaps", () => {
  const s = planSegments(
    tl([
      { t: 0, type: "wait_start" },
      { t: 1, type: "wait_end" },
    ]),
  );
  expect(s[0].from).toBe(0);
  expect(s.at(-1)!.to).toBe(20);
  s.slice(1).forEach((seg, i) => expect(seg.from).toBe(s[i].to));
});

test("sourceTimeAt inverts the speed-up", () => {
  const s = planSegments(
    tl([
      { t: 5, type: "wait_start" },
      { t: 8, type: "wait_end" },
    ]),
  );
  expect(sourceTimeAt(s, 2)).toBeCloseTo(2);
  expect(sourceTimeAt(s, 5.25)).toBeCloseTo(6.5);
  expect(sourceTimeAt(s, 6)).toBeCloseTo(8.5);
});

test("camera rests at scale 1 with no marks", () => {
  expect(cameraAt(tl([]), 3)).toEqual({ scale: 1, cx: 960, cy: 540 });
});

test("camera zooms on a click and stays inside the page", () => {
  const c = cameraAt(
    tl([{ t: 2, type: "click", box: { x: 1800, y: 1000, w: 100, h: 40 } }]),
    2.5,
  );
  expect(c.scale).toBeCloseTo(1.6, 1);
  expect(c.cx).toBeLessThanOrEqual(1920 - 1920 / c.scale / 2 + 0.001);
  expect(c.cy).toBeLessThanOrEqual(1080 - 1080 / c.scale / 2 + 0.001);
});

test("camera eases back after the hold", () => {
  const c = cameraAt(
    tl([{ t: 2, type: "focus", box: { x: 900, y: 500, w: 100, h: 40 } }], 20),
    8,
  );
  expect(c.scale).toBeCloseTo(1);
});
