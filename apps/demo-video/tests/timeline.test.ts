import { expect, test } from 'vitest';
import {
  calloutWindow,
  cameraAt,
  type Mark,
  outputDuration,
  outputTimeAt,
  planSegments,
  scaleSegments,
  shotOf,
  sourceTimeAt,
  type Timeline,
  toScreen,
} from '../src/timeline';

const tl = (marks: Mark[], duration = 20): Timeline => ({
  clip: 'x',
  duration,
  marks,
});

test('no waits: one segment at rate 1', () => {
  expect(planSegments(tl([]))).toEqual([{ from: 0, to: 20, rate: 1 }]);
});

test('a 3 s wait is sped up 6x', () => {
  const s = planSegments(
    tl([
      { t: 5, type: 'wait_start' },
      { t: 8, type: 'wait_end' },
    ]),
  );
  expect(s).toEqual([
    { from: 0, to: 5, rate: 1 },
    { from: 5, to: 8, rate: 6 },
    { from: 8, to: 20, rate: 1 },
  ]);
  expect(outputDuration(s)).toBeCloseTo(17.5);
});

test('a wait still longer than maxWait after speeding is cut to maxWait of output', () => {
  const s = planSegments(
    tl(
      [
        { t: 0, type: 'wait_start' },
        { t: 100, type: 'wait_end' },
      ],
      110,
    ),
  );
  expect(s[0]).toEqual({ from: 0, to: 100, rate: 12.5 });
  expect(outputDuration(s)).toBeCloseTo(18);
});

test('unterminated wait closes at clip end', () => {
  expect(planSegments(tl([{ t: 15, type: 'wait_start' }])).at(-1)).toEqual({
    from: 15,
    to: 20,
    rate: 6,
  });
});

test('overlapping waits merge', () => {
  const s = planSegments(
    tl([
      { t: 2, type: 'wait_start' },
      { t: 3, type: 'wait_start' },
      { t: 4, type: 'wait_end' },
      { t: 6, type: 'wait_end' },
    ]),
  );
  expect(s.filter((x) => x.rate > 1)).toEqual([{ from: 2, to: 6, rate: 6 }]);
});

test('segments tile the clip without gaps', () => {
  const s = planSegments(
    tl([
      { t: 0, type: 'wait_start' },
      { t: 1, type: 'wait_end' },
    ]),
  );
  expect(s[0].from).toBe(0);
  expect(s.at(-1)!.to).toBe(20);
  s.slice(1).forEach((seg, i) => expect(seg.from).toBe(s[i].to));
});

test('sourceTimeAt inverts the speed-up', () => {
  const s = planSegments(
    tl([
      { t: 5, type: 'wait_start' },
      { t: 8, type: 'wait_end' },
    ]),
  );
  expect(sourceTimeAt(s, 2)).toBeCloseTo(2);
  expect(sourceTimeAt(s, 5.25)).toBeCloseTo(6.5);
  expect(sourceTimeAt(s, 6)).toBeCloseTo(8.5);
});

test('camera rests at scale 1 with no marks', () => {
  expect(cameraAt(tl([]), 3)).toEqual({ scale: 1, cx: 960, cy: 540 });
});

test('a click gets a short gentle push-in that stays inside the page', () => {
  const t = tl([{ t: 2, type: 'click', box: { x: 1800, y: 1000, w: 100, h: 40 } }]);
  const c = cameraAt(t, 2.4);
  expect(c.scale).toBeCloseTo(1.3, 1);
  expect(c.cx).toBeLessThanOrEqual(1920 - 1920 / c.scale / 2 + 0.001);
  expect(c.cy).toBeLessThanOrEqual(1080 - 1080 / c.scale / 2 + 0.001);
  expect(cameraAt(t, 4).scale).toBeCloseTo(1);
});

test('a focus holds a closer zoom', () => {
  const c = cameraAt(tl([{ t: 2, type: 'focus', box: { x: 900, y: 500, w: 100, h: 40 } }]), 4);
  expect(c.scale).toBeCloseTo(1.6, 1);
});

test('camera eases back after the hold', () => {
  const c = cameraAt(tl([{ t: 2, type: 'focus', box: { x: 900, y: 500, w: 100, h: 40 } }], 20), 8);
  expect(c.scale).toBeCloseTo(1);
});

test('outputTimeAt is the inverse of sourceTimeAt', () => {
  const s = planSegments(
    tl([
      { t: 5, type: 'wait_start' },
      { t: 8, type: 'wait_end' },
    ]),
  );
  expect(outputTimeAt(s, 2)).toBeCloseTo(2);
  expect(outputTimeAt(s, 6.5)).toBeCloseTo(5.25);
  expect(outputTimeAt(s, 8.5)).toBeCloseTo(6);
});

test('scaleSegments speeds every segment by k', () => {
  const s = scaleSegments(
    [
      { from: 0, to: 10, rate: 1 },
      { from: 10, to: 16, rate: 6 },
    ],
    1.25,
  );
  expect(s).toEqual([
    { from: 0, to: 10, rate: 1.25 },
    { from: 10, to: 16, rate: 7.5 },
  ]);
});

test('toScreen maps the camera centre to the screen centre', () => {
  expect(toScreen({ scale: 1.6, cx: 400, cy: 300 }, { x: 400, y: 300 })).toEqual({
    x: 960,
    y: 540,
  });
  expect(toScreen({ scale: 2, cx: 960, cy: 540 }, { x: 1060, y: 540 })).toEqual({
    x: 1160,
    y: 540,
  });
});

test('shotOf finds a named shot and its box', () => {
  const box = { x: 10, y: 20, w: 30, h: 40 };
  const t = tl([
    { t: 3, type: 'shot', name: 'trace', box },
    { t: 5, type: 'shot', name: 'plain' },
  ]);
  expect(shotOf(t, 'trace')).toEqual({ t: 3, box });
  expect(shotOf(t, 'plain')).toEqual({ t: 5, box: undefined });
  expect(shotOf(t, 'missing')).toBeUndefined();
});

test('a callout lasts until the next shot, at most 3.5 s, and never past the scene', () => {
  const t = tl([
    { t: 2, type: 'shot', name: 'a' },
    { t: 4, type: 'shot', name: 'b' },
    { t: 10, type: 'shot', name: 'c' },
  ]);
  const segs = planSegments(t);
  expect(calloutWindow(t, segs, 'a', 20)).toEqual([2.3, 4]);
  expect(calloutWindow(t, segs, 'b', 20)).toEqual([4.3, 7.8]);
  expect(calloutWindow(t, segs, 'c', 12)).toEqual([10.3, 11.6]);
  expect(calloutWindow(t, segs, 'missing', 20)).toBeUndefined();
});
