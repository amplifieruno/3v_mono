import { useIdentity, useIsAuthenticated } from '@burojs/react';
import type * as React from 'react';
import { Navigate, useLocation } from 'react-router';
import type { ItapIdentity } from './types';

export const LOGIN_PATH = '/login';
export const ORGANIZATIONS_PATH = '/organizations';

/**
 * Route guard of the console: signed out goes to `/login` (remembering where
 * it came from), signed in without an organization goes to `/organizations`.
 * Nothing renders while either answer is pending (a disabled query during a
 * session transition is pending too), so a valid session is never bounced.
 */
export function RequireAuth({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const location = useLocation();
  const check = useIsAuthenticated();
  const identity = useIdentity<ItapIdentity>();

  if (check.status === 'pending') return null;
  if (check.data?.authenticated !== true) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }
  if (identity.status === 'pending') return null;
  if (!identity.data) return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  if (identity.data.organizationId === null) {
    return <Navigate to={ORGANIZATIONS_PATH} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
