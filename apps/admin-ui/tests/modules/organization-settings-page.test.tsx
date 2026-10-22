// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { LocationProbe } from '../support/location-probe';

/**
 * The "Settings" page: the current organization's settings in show mode, Edit
 * on the resource's own route, a value out of range refused on its field before
 * any request, and a refusal by the server (a CHECK violation) shown on the form.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';

const ROW = {
  organization_id: NOVA,
  recognition_threshold: 0.4,
  enrollment_duplicate_threshold: 0.5,
  detection_counter_throttle_seconds: 10,
  tracking_timeout_seconds: 300,
  tailgating_window_seconds: 5,
  abnormal_movement_max_count: 1,
  abnormal_movement_min_total: 20,
  archive_unknown_after_days: 90,
  default_retention_days: 90,
  consent_embedding_retention_days: 30,
  policy_revocation_bound_seconds: 60,
  face_credential_cooldown_seconds: 10,
  policy_epoch: 46,
  policy_epoch_at: '2026-10-20T20:39:17Z',
  policy_urgent_epoch: 45,
  policy_urgent_at: '2026-10-20T20:39:17Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

/** What Hasura answers `org_admin` for a CHECK violation (measured on the dev stack). */
const CHECK_VIOLATION = {
  errors: [
    {
      message:
        'Check constraint violation. new row for relation "organization_settings" violates check constraint "organization_settings_policy_revocation_bound_range"',
      extensions: { path: '$', code: 'permission-error' },
    },
  ],
};

/** Reads answer the row (and empty facility lists for the picker); every mutation is refused. */
async function fakeGraphql(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  if (query.trimStart().startsWith('mutation')) return hasuraResponse(CHECK_VIOLATION);
  const data = query.includes('organization_settings_by_pk')
    ? { item: ROW }
    : query.includes('_aggregate')
      ? { meta: { aggregate: { count: 0 } } }
      : { items: [] };
  return hasuraResponse({ data });
}

function mutations(): number {
  return vi.mocked(fetch).mock.calls.filter(([, init]) => String(init?.body).includes('"mutation'))
    .length;
}

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('organization settings page', () => {
  it('should show the settings, refuse an out-of-range value on its field and show a server refusal', async () => {
    render(
      <MemoryRouter initialEntries={['/organization-settings']}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Recognition')).toBeDefined();
    expect(screen.getByText('Physical access')).toBeDefined();
    expect(screen.getByText('Urgent policy version')).toBeDefined();
    // The current-record frame: the page heading only, no `#<id>` title (`tasks/ui/buro-gaps.md` G16).
    expect(screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)).not.toContain(
      NOVA,
    );
    expect(screen.queryByRole('button', { name: 'Copy ID' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: /Edit/ }));
    expect(
      await screen.findByText(`/organization_settings/${NOVA}/edit`, {
        selector: '[data-testid="location"]',
      }),
    ).toBeDefined();

    const bound = await screen.findByRole('spinbutton', { name: /^Revocation bound/ });
    fireEvent.change(bound, { target: { value: '5' } });
    fireEvent.blur(bound);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Enter a whole number from 10 to 3600.')).toBeDefined();
    expect(mutations()).toBe(0);

    fireEvent.change(bound, { target: { value: '30' } });
    fireEvent.blur(bound);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    const alert = await screen.findByRole('alert');
    // The refusal reaches the form as `forbidden` without a field (`tasks/ui/buro-gaps.md` G14); the
    // form-level alert reads it from the message as a validation failure.
    expect(alert.textContent).toContain('Validation failed');
    expect(mutations()).toBe(1);
  });
});
