// @vitest-environment jsdom
import type { ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { SecretInput } from '../../src/fields/secret-input';
import type { SecretMeta } from '../../src/fields/secret-meta';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * The `itap.secret` input: an empty box leaves the stored secret alone (`undefined`, left out of
 * the payload) and typing replaces it.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const RECORD = { id: '22222222-2222-4222-8222-222222222222', name: 'Sensor' };

function renderInput(value: unknown, record?: Record<string, unknown>) {
  const onChange = vi.fn();
  const props = {
    meta: { writeOnly: true },
    presentation: 'default',
    accessibility: { input: 'secret' },
    testIds: { root: 'secret-root', input: 'secret-input', display: 'secret-display' },
    multiple: false,
    issues: [],
    value,
    onChange,
    ...(record === undefined ? {} : { record }),
  } as unknown as ScalarInputProps<unknown, SecretMeta>;
  const view = render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      <SecretInput {...props} />
    </AppRuntime>,
  );
  const rerender = (next: unknown): void =>
    view.rerender(
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        <SecretInput {...({ ...props, value: next } as typeof props)} />
      </AppRuntime>,
    );
  return { onChange, rerender };
}

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('secret input', () => {
  it('should report an emptied box as undefined (keep the stored secret) and a typed one as the value', async () => {
    const { onChange, rerender } = renderInput(undefined, RECORD);
    fireEvent.change(await screen.findByTestId('secret-input'), { target: { value: 'n3w' } });
    expect(onChange).toHaveBeenLastCalledWith('n3w');
    rerender('n3w');
    fireEvent.change(await screen.findByTestId('secret-input'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('should offer no removal on a stored record: that is the Remove password flow', async () => {
    renderInput(undefined, RECORD);
    await screen.findByTestId('secret-input');
    expect(screen.queryByRole('button', { name: 'Remove the stored value' })).toBeNull();
  });

  it('should offer no removal on a create form (nothing is stored yet)', async () => {
    renderInput(undefined);
    await screen.findByTestId('secret-input');
    expect(screen.queryByRole('button', { name: 'Remove the stored value' })).toBeNull();
  });
});
