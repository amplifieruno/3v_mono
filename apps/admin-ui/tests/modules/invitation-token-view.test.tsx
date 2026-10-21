// @vitest-environment jsdom
import { toast } from '@burojs/ui-shadcn';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationTokenView } from '../../src/modules/organization/invitation-token-view';

/**
 * The token's Copy button: copies through the Clipboard API, and says so when
 * it cannot (no API over plain HTTP, or a refused write) instead of throwing.
 */

const t = (key: string): string => key;

function renderView(): void {
  render(<InvitationTokenView props={{ token: 'tok-123', expiresAt: '2030-01-01T00:00:00Z' }} data={{}} t={t} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubClipboard(clipboard: Partial<Clipboard> | undefined): void {
  vi.stubGlobal('navigator', { ...navigator, clipboard });
}

describe('invitation token view', () => {
  it('should copy the token and confirm', async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard({ writeText });
    const success = vi.spyOn(toast, 'success');
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /copy/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('copied'));
    expect(writeText).toHaveBeenCalledWith('tok-123');
  });

  it('should report a missing Clipboard API instead of throwing', () => {
    stubClipboard(undefined);
    const error = vi.spyOn(toast, 'error');
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /copy/ }));
    expect(error).toHaveBeenCalledWith('copyFailed');
  });

  it('should report a refused write', async () => {
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
    const error = vi.spyOn(toast, 'error');
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /copy/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('copyFailed'));
  });
});
