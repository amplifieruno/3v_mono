import { RouterAdapterProvider } from '@burojs/react';
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

/** The one react-router binding the framework reads: location and navigation. */
export function ReactRouterAdapter({ children }: { children: React.ReactNode }): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const adapter = React.useMemo(
    () => ({
      pathname: location.pathname,
      searchParams,
      replace: (url: string) => navigate(url, { replace: true }),
      push: (url: string) => navigate(url),
    }),
    [location.pathname, searchParams, navigate],
  );

  return <RouterAdapterProvider adapter={adapter}>{children}</RouterAdapterProvider>;
}
