import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { AppRuntime } from '../../src/app/runtime';
import { ORG } from './analytics-fake';
import { fakeAdminAuth } from './console-dom';

/** Shared by the analytic block tests: the console runtime the blocks render in (helpers: `./analytics-fake.ts`). */

export function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}
