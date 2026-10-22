import { describe, expect, it } from 'vitest';
import { problemIssue } from '../../src/fields/field-issue';
import { checkTimeWindows, timeWindows } from '../../src/fields/time-windows';
import { formatWindows, validateWindows } from '../../src/fields/time-windows-format';
import { expectTranslated, validatorResult } from '../support/field-issues';

/**
 * Time windows (`[{ days: 1..7 ISO, from: 'HH:MM', to: 'HH:MM' }]`, `from > to` crosses
 * midnight): the compact text and the validator mirroring `itap.valid_windows`, plus
 * the refusal of a window that never matches (equal ends).
 */

const OVERNIGHT = [{ days: [6], from: '22:00', to: '06:00' }];

describe('formatWindows', () => {
  it('should collapse consecutive weekdays into a range', () => {
    expect(formatWindows([{ days: [5, 1, 2, 3, 4], from: '08:00', to: '18:00' }], 'en')).toBe(
      'Mon–Fri 08:00–18:00',
    );
  });

  it('should list separate days and join windows with a semicolon', () => {
    expect(
      formatWindows(
        [
          { days: [1, 3], from: '09:00', to: '12:00' },
          { days: [6, 7], from: '10:00', to: '14:00' },
        ],
        'en',
      ),
    ).toBe('Mon, Wed 09:00–12:00; Sat, Sun 10:00–14:00');
  });

  it('should label an overnight window and every day of the week', () => {
    expect(formatWindows(OVERNIGHT, 'en')).toBe('Sat 22:00–06:00 (overnight)');
    expect(formatWindows([{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }], 'en')).toBe(
      'Daily 00:00–24:00',
    );
  });

  it('should name the weekdays in the given locale and take the labels given', () => {
    expect(formatWindows([{ days: [1, 2, 3], from: '08:00', to: '18:00' }], 'de')).toBe(
      'Mo–Mi 08:00–18:00',
    );
    expect(formatWindows(OVERNIGHT, 'en', { overnight: 'night', daily: 'All week' })).toBe(
      'Sat 22:00–06:00 (night)',
    );
  });

  it('should show nothing for no windows', () => {
    expect(formatWindows([], 'en')).toBe('');
    expect(formatWindows(null, 'en')).toBe('');
  });
});

describe('validateWindows', () => {
  it('keeps an overnight window', async () => {
    expect(validateWindows(OVERNIGHT)).toBeNull();
    expect(await validatorResult(checkTimeWindows, OVERNIGHT)).toBeNull();
    expect(formatWindows(OVERNIGHT, 'en')).toBe('Sat 22:00–06:00 (overnight)');
  });

  it('should accept the stored shapes the data layer accepts', () => {
    expect(validateWindows([])).toBeNull();
    expect(validateWindows(null)).toBeNull();
    expect(
      validateWindows([{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }]),
    ).toBeNull();
    expect(validateWindows([{ days: [1, 2, 3, 4, 5], from: '08:00', to: '20:00' }])).toBeNull();
  });

  it('refuses an empty or malformed window with a translatable issue', async () => {
    const refused: readonly [unknown, RegExp][] = [
      [[{ days: [], from: '08:00', to: '18:00' }], /window 1: pick at least one day/i],
      [[{ days: [0], from: '08:00', to: '18:00' }], /window 1: .*days/i],
      [[{ days: [8], from: '08:00', to: '18:00' }], /window 1: .*days/i],
      [[{ days: [1.5], from: '08:00', to: '18:00' }], /window 1: .*days/i],
      [[{ days: [1], from: '8:00', to: '18:00' }], /window 1: .*HH:MM/i],
      [[{ days: [1], from: '24:00', to: '06:00' }], /window 1: .*HH:MM/i],
      [[{ days: [1], from: '08:00', to: '18:60' }], /window 1: .*HH:MM/i],
      [[{ days: [1], from: '08:00' }], /window 1: .*HH:MM/i],
      [
        [
          { days: [1], from: '08:00', to: '18:00' },
          { days: [2], from: '09:00', to: '09:00' },
        ],
        /window 2: .*start and end are the same/i,
      ],
      [[{ days: [1], from: '08:00', to: '18:00', note: 'x' }], /window 1: .*unexpected/i],
      [['08:00-18:00'], /window 1/i],
      [{ days: [1] }, /list/i],
    ];
    for (const [value, message] of refused) {
      const problem = validateWindows(value);
      expect(problem?.text, JSON.stringify(value)).toMatch(message);
      if (problem === null) continue;
      expect(problem.code).toMatch(/^timeWindows\./u);
      expect(await validatorResult(checkTimeWindows, value)).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
  });
});

describe('timeWindows field', () => {
  it('should be a json field rendered by the itap.time-windows implementation', () => {
    const field = timeWindows({ emptyText: 'Never on shift', texts: 'Windows' });
    expect(field.kind).toBe('json');
    expect(field.ui).toMatchObject({ input: 'itap.time-windows', display: 'itap.time-windows' });
    expect(field.meta).toEqual({ nullable: false, emptyText: 'Never on shift' });
    expect(field.opts.validate).toBe(checkTimeWindows);
    expect(timeWindows({ nullable: true, emptyText: 'Always open' }).meta).toEqual({
      nullable: true,
      emptyText: 'Always open',
    });
  });
});
