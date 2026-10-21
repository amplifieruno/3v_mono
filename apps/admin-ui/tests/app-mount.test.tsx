// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';

afterEach(cleanup);

describe('App', () => {
  it('should mount the placeholder root', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeDefined();
  });
});
