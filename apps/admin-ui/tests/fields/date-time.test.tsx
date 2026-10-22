// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ScalarDisplayProps } from '@burojs/react';
import { DateTimeDisplay } from '../../src/fields/date-time-display';

type DisplayProps = ScalarDisplayProps<unknown>;
import { formatDateTime, fromLocalInput, instantOf, toLocalInput } from '../../src/fields/date-time-format';

/**
 * The date-time field (`itap.date-time`) in a time zone with daylight saving time: the input's
 * local `YYYY-MM-DDTHH:mm` and the stored UTC instant convert both ways, across both DST
 * changes, and the display honours the `plain` presentation.
 */

const ZONE = 'Europe/Berlin';
const previousZone = process.env.TZ;

beforeAll(() => {
  // Node reads TZ again when it changes; every Date below is local to Berlin.
  process.env.TZ = ZONE;
});

afterAll(() => {
  if (previousZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousZone;
});

afterEach(cleanup);

describe('local input and stored instant', () => {
  it('should run in the time zone the cases assume', () => {
    expect(new Date('2026-07-01T00:00:00Z').getTimezoneOffset()).toBe(-120);
    expect(new Date('2026-12-01T00:00:00Z').getTimezoneOffset()).toBe(-60);
  });

  it('should show a stored instant as local time, summer and winter', () => {
    expect(toLocalInput('2026-10-22T07:05:00Z')).toBe('2026-10-22T09:05');
    expect(toLocalInput('2026-12-01T09:00:00.000Z')).toBe('2026-12-01T10:00');
    expect(toLocalInput(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02T00:30');
  });

  it('should store a local time as the UTC instant, summer and winter', () => {
    expect(fromLocalInput('2026-10-22T09:05')).toBe('2026-10-22T07:05:00.000Z');
    expect(fromLocalInput('2026-12-01T10:00')).toBe('2026-12-01T09:00:00.000Z');
  });

  it('should move a time in the skipped spring-forward hour to after the change', () => {
    // 29 March 2026: 02:00 local does not exist (clocks go to 03:00 CEST).
    expect(fromLocalInput('2026-03-29T02:30')).toBe('2026-03-29T01:30:00.000Z');
    expect(toLocalInput('2026-03-29T00:59:00Z')).toBe('2026-03-29T01:59');
    expect(toLocalInput('2026-03-29T01:00:00Z')).toBe('2026-03-29T03:00');
  });

  it('should read the repeated fall-back hour as its first occurrence', () => {
    // 25 October 2026: 02:30 local happens twice, at 00:30Z (CEST) and 01:30Z (CET).
    expect(toLocalInput('2026-10-25T00:30:00Z')).toBe('2026-10-25T02:30');
    expect(toLocalInput('2026-10-25T01:30:00Z')).toBe('2026-10-25T02:30');
    expect(fromLocalInput('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('should round-trip every half hour across both changes, except the repeated hour', () => {
    for (const day of ['2026-03-28T22:00:00Z', '2026-10-24T22:00:00Z']) {
      for (let step = 0; step < 12; step += 1) {
        const at = new Date(Date.parse(day) + step * 30 * 60_000).toISOString();
        const repeated = at >= '2026-10-25T01:00:00.000Z' && at < '2026-10-25T02:00:00.000Z';
        if (!repeated) expect(fromLocalInput(toLocalInput(at)), at).toBe(at);
      }
    }
  });

  it('should treat empty and unreadable values as empty', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('')).toBe('');
    expect(toLocalInput('not a date')).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('2026-13-40T99:99')).toBeNull();
    expect(instantOf('nope')).toBeNull();
    expect(instantOf(new Date('2026-10-22T07:05:00Z'))).toBe(Date.parse('2026-10-22T07:05:00Z'));
  });
});

describe('DateTimeDisplay', () => {
  const show = (value: unknown, presentation: 'default' | 'plain') =>
    render(
      <DateTimeDisplay {...({ value, presentation, testIds: { display: 'at' }, multiple: false } as unknown as DisplayProps)} />,
    );

  it('should show the date and local time of day on one line', () => {
    show('2026-10-22T07:05:00Z', 'default');
    const shown = screen.getByTestId('at');
    expect(shown.textContent).toBe(formatDateTime(Date.parse('2026-10-22T07:05:00Z')));
    expect(shown.textContent).toMatch(/09:05/);
    expect(shown.className).toBe('whitespace-nowrap');
  });

  it('should drop its own styling in the plain presentation', () => {
    show('2026-10-22T07:05:00Z', 'plain');
    expect(screen.getByTestId('at').className).toBe('');
    cleanup();
    show(null, 'plain');
    expect(screen.getByTestId('at').className).toBe('');
    expect(screen.getByTestId('at').textContent).toBe('—');
    cleanup();
    show(null, 'default');
    expect(screen.getByTestId('at').className).toBe('text-muted-foreground');
  });
});
