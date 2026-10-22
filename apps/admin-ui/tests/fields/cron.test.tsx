// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { createI18nFromRegistry } from '@burojs/i18n-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { cronField } from '../../src/fields/cron';
import { CronDisplay } from '../../src/fields/cron-display';
import {
  CRON_PHRASES,
  INVALID_CRON,
  checkCron,
  compressList,
  cronNeverRuns,
  cronSummary,
  parseCron,
} from '../../src/fields/cron-format';
import { CronInput } from '../../src/fields/cron-input';
import { buildLocaleRegistry } from '../../src/i18n/registry';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';
import { expectTranslated, issueText, validatorResult } from '../support/field-issues';

/**
 * The `itap.cron` field of report schedules: exactly the crons `itap.valid_cron` accepts (5 fields,
 * numbers, `*`, ranges, lists, steps, weekday 0–7), a readable sentence for each, "never runs" for a
 * date no month has, and an invalid cron refused by the form and flagged on display.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

const context = {
  meta: {},
  presentation: 'default',
  accessibility: { input: 'cron' },
  testIds: { root: 'cron-root', input: 'cron-input', display: 'cron-display' },
  multiple: false,
  issues: [],
  i18n: { locale: 'en' },
} as const;

const renderInRuntime = (node: React.ReactNode) =>
  render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      {node}
    </AppRuntime>,
  );

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('cron grammar (itap.valid_cron)', () => {
  it.each([
    '0 7 * * *',
    '0 7 * * 1',
    '*/15 * * * *',
    '0 8-17 * * 1-5',
    '0,30 6 1,15 * *',
    '0 0 1 1 *',
    '5 4 * * 7',
    '0 0 * * 0-7',
    '59 23 31 12 6',
    '  0   7  *  *  1 ',
    '1-10/3 * * * *',
    '5/10 * * * *',
    '0 7 30 2 *',
  ])('should accept %j', (cron) => {
    expect(parseCron(cron)).not.toBeNull();
    expect(checkCron(cron)).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['0 7 * *', 'four fields'],
    ['0 7 * * * *', 'six fields'],
    ['60 7 * * *', 'minute 60'],
    ['0 24 * * *', 'hour 24'],
    ['0 7 0 * *', 'day 0'],
    ['0 7 32 * *', 'day 32'],
    ['0 7 * 13 *', 'month 13'],
    ['0 7 * * 8', 'weekday 8'],
    ['0 7 * * MON', 'a weekday name'],
    ['0 7 ? * *', 'a question mark'],
    ['0 7 L * *', 'L'],
    ['0 7 * * 1#2', '#'],
    ['*/0 * * * *', 'step 0'],
    ['5-1 * * * *', 'a descending range'],
    ['0 7 1,,2 * *', 'an empty list item'],
    ['100 7 * * *', 'three digits'],
    ['*-5 * * * *', 'a star range'],
  ])('should refuse %j (%s)', (cron) => {
    expect(parseCron(cron)).toBeNull();
    expect(cronSummary(cron)).toBeNull();
  });

  it('should refuse anything but text', () => {
    expect(parseCron(null)).toBeNull();
    expect(parseCron(7)).toBeNull();
  });

  it('should leave an empty value to the required rule and refuse an invalid one, translated', async () => {
    expect(checkCron(null)).toBeNull();
    expect(checkCron('')).toBeNull();
    expect(checkCron('0 7 * *')).toEqual(INVALID_CRON);
    await expectTranslated(INVALID_CRON);
    const field = cronField({ required: true });
    expect(issueText(await validatorResult(field.opts.validate, 'nope'))).toBe(INVALID_CRON.text);
    expect(await validatorResult(field.opts.validate, '0 7 * * 1')).toBeNull();
  });
});

describe('cron summary', () => {
  it.each([
    ['0 7 * * *', 'At 07:00 every day'],
    ['0 7 * * 1', 'At 07:00 on Monday'],
    ['0 7 * * 1-5', 'At 07:00 on Monday–Friday'],
    ['0 7 * * 7', 'At 07:00 on Sunday'],
    ['0 7 * * 0,6', 'At 07:00 on Sunday, Saturday'],
    ['30 6 1 * *', 'At 06:30 on day 1 of the month'],
    ['0 7 1,15 * *', 'At 07:00 on day 1, 15 of the month'],
    ['0 7 1 * 1', 'At 07:00 on day 1 of the month or on Monday'],
    ['0 6 1 1-3 *', 'At 06:00 on day 1 of the month in January–March'],
    ['0 8,12,18 * * *', 'At 08:00, 12:00, 18:00 every day'],
    ['*/15 * * * *', 'Every 15 minutes'],
    ['* * * * *', 'Every minute'],
    ['0 * * * *', 'At minute 00 of every hour'],
    ['*/10 8-17 * * 1-5', 'Every 10 minutes, during hours 08–17 on Monday–Friday'],
  ])('should read %j as %j', (cron, sentence) => {
    expect(cronSummary(cron)).toBe(sentence);
  });

  it('should say when a cron never runs (no month has the day)', () => {
    expect(cronNeverRuns(parseCron('0 7 30 2 *') ?? fail())).toBe(true);
    expect(cronNeverRuns(parseCron('0 7 31 4,6 *') ?? fail())).toBe(true);
    // February 29 comes in a leap year; a restricted weekday makes either day run.
    expect(cronNeverRuns(parseCron('0 7 29 2 *') ?? fail())).toBe(false);
    expect(cronNeverRuns(parseCron('0 7 30 2 1') ?? fail())).toBe(false);
    expect(cronNeverRuns(parseCron('0 7 * * 1') ?? fail())).toBe(false);
  });

  it('should compress runs of values', () => {
    expect(compressList([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7, 8');
    expect(compressList([])).toBe('');
  });

  it('should translate every phrase from the bundle with its English default', async () => {
    const i18n = await createI18nFromRegistry(buildLocaleRegistry(), { defaultLocale: 'en', warnOnMissing: false });
    for (const [key, text] of Object.entries(CRON_PHRASES)) {
      expect(i18n.t(`console.cron.${key}`), key).toBe(text);
    }
  });
});

function fail(): never {
  throw new Error('expected a valid cron');
}

describe('cron field on screen', () => {
  it('should show the sentence and the expression, and flag an invalid cron', async () => {
    const display = (value: unknown) =>
      renderInRuntime(<CronDisplay {...({ ...context, value } as unknown as ScalarDisplayProps<unknown>)} />);
    display('0 7 * * 1');
    expect((await screen.findByTestId('cron-display')).textContent).toBe('At 07:00 on Monday0 7 * * 1');
    cleanup();
    display('0 7 * *');
    expect((await screen.findByTestId('cron-display')).getAttribute('data-invalid')).toBe('true');
    cleanup();
    display('0 7 30 2 *');
    expect((await screen.findByTestId('cron-display')).textContent).toContain('Never runs');
  });

  it('should explain what is typed and write a preset', async () => {
    const onChange = vi.fn();
    const input = (value: unknown) =>
      renderInRuntime(<CronInput {...({ ...context, value, onChange } as unknown as ScalarInputProps<unknown>)} />);
    input('0 7 * * 1-5');
    expect((await screen.findByTestId('cron-summary')).textContent).toBe('At 07:00 on Monday–Friday');
    fireEvent.click(screen.getByRole('button', { name: 'Mondays 07:00' }));
    expect(onChange).toHaveBeenCalledWith('0 7 * * 1');
    fireEvent.change(screen.getByTestId('cron-input'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    cleanup();
    input('0 7 * * MON');
    expect((await screen.findByTestId('cron-summary')).textContent).toBe('not a schedule the platform accepts');
    expect(screen.getByTestId('cron-input').getAttribute('aria-invalid')).toBe('true');
  });
});
