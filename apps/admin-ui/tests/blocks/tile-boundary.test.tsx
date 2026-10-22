// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TileBoundary } from '../../src/blocks/dashboard-grid/tile-boundary';

function Boom({ fail }: { readonly fail: boolean }) {
  if (fail) throw new Error('bad settings');
  return <p>drawn</p>;
}

afterEach(cleanup);

describe('tile boundary', () => {
  it('should draw the widget again once its settings (the reset key) change', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = (key: string, fail: boolean) => (
      <TileBoundary fallback={<p>failed</p>} resetKey={key}>
        <Boom fail={fail} />
      </TileBoundary>
    );
    const { rerender } = render(view('a', true));
    expect(screen.getByText('failed')).toBeTruthy();
    rerender(view('a', false));
    expect(screen.getByText('failed')).toBeTruthy();
    rerender(view('b', false));
    expect(screen.getByText('drawn')).toBeTruthy();
  });
});
