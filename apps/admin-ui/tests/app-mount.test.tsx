// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';

afterEach(cleanup);

describe('App', () => {
  it('should boot the runtime and show the sign-in page without a session', async () => {
    localStorage.clear();
    window.history.replaceState(null, '', '/dashboard');
    render(<App />);
    expect(await screen.findByLabelText(/email/i)).toBeDefined();
    expect(window.location.pathname).toBe('/login');
  });
});
