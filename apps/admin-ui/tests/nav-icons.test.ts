import { hasIcon } from '@burojs/ui-shadcn';
import { describe, expect, it } from 'vitest';
import { NAV_ICONS } from '../src/app/nav';
import { registerNavIcons } from '../src/app/register-icons';

describe('navigation icons', () => {
  it('should resolve every icon the navigation names once registered', () => {
    registerNavIcons();
    const unresolved = Object.entries(NAV_ICONS)
      .filter(([, name]) => !hasIcon(name))
      .map(([key, name]) => `${key}: ${name}`);
    expect(unresolved).toEqual([]);
  });
});
