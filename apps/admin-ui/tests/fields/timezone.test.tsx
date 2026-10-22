// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { timezone } from '../../src/fields/timezone';
import { TimezoneDisplay } from '../../src/fields/timezone-display';
import { TimezoneInput } from '../../src/fields/timezone-input';
import type { TimezoneMeta } from '../../src/fields/timezone-meta';
import {
  UNKNOWN_TIMEZONE,
  checkTimezone,
  isTimezone,
  timezoneOffset,
  timezoneOptions,
} from '../../src/fields/timezone-zones';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';
import { expectTranslated, issueText, validatorResult } from '../support/field-issues';

/**
 * The `itap.timezone` field: IANA zones with their current UTC offset, and a zone
 * the browser does not know shown as invalid (flagged), never silently as UTC.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

/** The render context of a field implementation; only what these components read. */
const context = {
  meta: { nullable: false },
  presentation: 'default',
  accessibility: { input: 'tz' },
  testIds: { root: 'tz-root', input: 'tz-input', display: 'tz-display' },
  multiple: false,
} as const;

function renderInRuntime(node: React.ReactNode) {
  return render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      {node}
    </AppRuntime>,
  );
}

function renderDisplay(value: unknown) {
  const props = { ...context, value } as unknown as ScalarDisplayProps<unknown>;
  return renderInRuntime(<TimezoneDisplay {...props} />);
}

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('timezone zones', () => {
  it('should list UTC first and the IANA zones with their offset', () => {
    const options = timezoneOptions(new Date('2026-01-15T12:00:00Z'));
    expect(options[0]).toEqual({ zone: 'UTC', offset: 'UTC+00:00' });
    expect(options).toContainEqual({ zone: 'Europe/Moscow', offset: 'UTC+03:00' });
    expect(options).toContainEqual({ zone: 'Asia/Tokyo', offset: 'UTC+09:00' });
    expect(timezoneOffset('Asia/Kolkata')).toBe('UTC+05:30');
    expect(timezoneOffset('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe('UTC-04:00');
  });

  it('should tell a known zone from an unknown one', () => {
    expect(isTimezone('Europe/Moscow')).toBe(true);
    expect(isTimezone('UTC')).toBe(true);
    expect(isTimezone('Mars/Olympus')).toBe(false);
    expect(isTimezone('UTC+3')).toBe(false);
    expect(isTimezone('')).toBe(false);
    expect(isTimezone(42)).toBe(false);
  });

  it('should refuse offsets, whose sign PostgreSQL reads the other way, and keep stored aliases', () => {
    for (const offset of ['+03:00', '-05:00', '+0300', '-0500', ' +03:00', 'Etc/GMT+3']) {
      expect(isTimezone(offset), offset).toBe(false);
      expect(checkTimezone(offset), offset).toBe(UNKNOWN_TIMEZONE);
      expect(timezoneOffset(offset), offset).toBeNull();
    }
    for (const alias of ['Asia/Kolkata', 'Asia/Calcutta', 'US/Eastern', 'Europe/Kyiv', 'Etc/UTC']) {
      expect(isTimezone(alias), alias).toBe(true);
    }
  });
});

describe('timezone field', () => {
  it('should be a string field rendered by the itap.timezone implementation', () => {
    const field = timezone({ texts: 'Time zone', required: true });
    expect(field.kind).toBe('string');
    expect(field.ui).toMatchObject({ input: 'itap.timezone', display: 'itap.timezone' });
    expect(field.meta).toEqual({ nullable: false });
    expect(timezone({ texts: 'Time zone' }).meta).toEqual({ nullable: true });
  });

  it('should show the zone with its current offset', async () => {
    renderDisplay('Asia/Kolkata');
    const shown = await screen.findByTestId('tz-display');
    expect(shown.textContent).toBe('Asia/Kolkata (UTC+05:30)');
  });

  it('flags an unknown timezone', async () => {
    const field = timezone({ texts: 'Time zone', required: true });
    expect(issueText(await validatorResult(field.opts.validate, 'Mars/Olympus'))).toMatch(
      /not a known time zone/i,
    );
    expect(await validatorResult(field.opts.validate, 'Europe/Moscow')).toBeNull();
    await expectTranslated(UNKNOWN_TIMEZONE);

    renderDisplay('Mars/Olympus');
    const shown = await screen.findByTestId('tz-display');
    expect(shown.textContent).toContain('Mars/Olympus');
    expect(shown.textContent).toContain('Unknown time zone');
    expect(shown.textContent).not.toContain('UTC');
    expect(shown.getAttribute('data-invalid')).toBe('true');
    cleanup();

    const props = {
      ...context,
      value: 'Mars/Olympus',
      onChange: vi.fn(),
    } as unknown as ScalarInputProps<unknown, TimezoneMeta>;
    renderInRuntime(<TimezoneInput {...props} />);
    const trigger = await screen.findByTestId('tz-input');
    expect(trigger.textContent).toContain('Mars/Olympus');
    expect(trigger.textContent).toContain('Unknown time zone');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('timezone input clear', () => {
  function renderInput(value: unknown, nullable: boolean) {
    const onChange = vi.fn();
    const props = {
      ...context,
      meta: { nullable },
      value,
      onChange,
      issues: [],
    } as unknown as ScalarInputProps<unknown, TimezoneMeta>;
    renderInRuntime(<TimezoneInput {...props} />);
    return onChange;
  }

  it('should clear an optional zone to null', async () => {
    const onChange = renderInput('Asia/Tokyo', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear time zone' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('should offer no clear for a required zone or an empty one', async () => {
    renderInput('Asia/Tokyo', false);
    await screen.findByTestId('tz-input');
    expect(screen.queryByRole('button', { name: 'Clear time zone' })).toBeNull();
    cleanup();
    renderInput(null, true);
    await screen.findByTestId('tz-input');
    expect(screen.queryByRole('button', { name: 'Clear time zone' })).toBeNull();
  });
});
