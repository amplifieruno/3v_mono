// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { timezone } from '../../src/fields/timezone';
import { TimezoneDisplay } from '../../src/fields/timezone-display';
import { TimezoneInput } from '../../src/fields/timezone-input';
import { isTimezone, timezoneOffset, timezoneOptions } from '../../src/fields/timezone-zones';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * The `itap.timezone` field: IANA zones with their current UTC offset, and a zone
 * the browser does not know shown as invalid (flagged), never silently as UTC.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

/** The render context of a field implementation; only what these components read. */
const context = {
  meta: {},
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
});

describe('timezone field', () => {
  it('should be a string field rendered by the itap.timezone implementation', () => {
    const field = timezone({ texts: 'Time zone', required: true });
    expect(field.kind).toBe('string');
    expect(field.ui).toMatchObject({ input: 'itap.timezone', display: 'itap.timezone' });
  });

  it('should show the zone with its current offset', async () => {
    renderDisplay('Asia/Kolkata');
    const shown = await screen.findByTestId('tz-display');
    expect(shown.textContent).toBe('Asia/Kolkata (UTC+05:30)');
  });

  it('flags an unknown timezone', async () => {
    const field = timezone({ texts: 'Time zone', required: true });
    const validate = field.opts.validate as (value: unknown) => string | null;
    expect(validate('Mars/Olympus')).toMatch(/not a known time zone/i);
    expect(validate('Europe/Moscow')).toBeNull();

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
    } as unknown as ScalarInputProps<unknown>;
    renderInRuntime(<TimezoneInput {...props} />);
    const trigger = await screen.findByTestId('tz-input');
    expect(trigger.textContent).toContain('Mars/Olympus');
    expect(trigger.textContent).toContain('Unknown time zone');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });
});
