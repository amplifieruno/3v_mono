import { generateRouteDescriptors, isCustomPageRoute, useApp } from '@burojs/react';
import {
  AppActions,
  AppHeader,
  AppShell,
  AppSidebar,
  DocPanel,
  type LinkComponent,
  type LinkComponentProps,
  LinkComponentProvider,
  NavAreaPage,
  RefreshButton,
} from '@burojs/ui-shadcn';
import * as React from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router';
import type { ItapAuthProvider, TokenStore } from '../auth';
import { LoginPage } from '../auth/login-page';
import { OrganizationPickerPage } from '../auth/organization-picker-page';
import { LOGIN_PATH, ORGANIZATIONS_PATH, RequireAuth } from '../auth/require-auth';
import { authProvider, tokenStore } from '../auth/session';
import { ActiveOverrideBanner } from './active-override-banner';
import { HOME_PATH, useConsoleBrand } from './brand';
import { FacilityPicker } from './facility-picker';
import { InboxBell } from './inbox-bell';
import { OrganizationSwitcher } from './organization-switcher';
import { ReactRouterAdapter } from './router-adapter';
import { AppRuntime } from './runtime';

/** react-router's `<Link>` behind every anchor the framework renders. */
const RouterLink: LinkComponent = React.forwardRef<HTMLAnchorElement, LinkComponentProps>(function RouterLink(
  { href, children, ...rest },
  ref,
) {
  return (
    <Link ref={ref} to={href} {...rest}>
      {children}
    </Link>
  );
});

/** The header's right-hand controls: the inbox bell, then the kit's actions and refresh. */
const headerActions = (
  <>
    <InboxBell />
    <AppActions />
    <RefreshButton />
  </>
);

/**
 * The application frame for a signed-in user inside an organization: the
 * organization switcher heads the sidebar, the facility picker sits under it,
 * the header carries the inbox bell, and active emergency overrides head every page.
 */
function ConsoleShell(): React.ReactElement {
  const brand = useConsoleBrand();
  return (
    <RequireAuth>
      <AppShell
        brand={brand}
        loginPath={LOGIN_PATH}
        docPanel={<DocPanel />}
        header={<AppHeader actions={headerActions} />}
        sidebar={<AppSidebar header={<OrganizationSwitcher />} filters={<FacilityPicker />} />}
      >
        {/* buro's shell has no banner slot (G76): the active emergency overrides head every page. */}
        <ActiveOverrideBanner />
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

/**
 * `/login` and `/organizations` render outside the shell; every registered
 * page and resource route renders inside it, behind the guard. An unknown
 * address gets the framework's not-found panel inside the shell.
 */
function ConsoleRoutes(): React.ReactElement {
  const app = useApp();
  const descriptors = React.useMemo(() => generateRouteDescriptors(app), [app]);
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route path={ORGANIZATIONS_PATH} element={<OrganizationPickerPage />} />
      <Route element={<ConsoleShell />}>
        {descriptors.map((d) => (
          <Route
            key={isCustomPageRoute(d) ? `page:${d.page}` : `${d.resource}:${d.action}`}
            path={d.path}
            element={<NavAreaPage />}
          />
        ))}
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path="*" element={<NavAreaPage />} />
      </Route>
    </Routes>
  );
}

export interface ConsoleAppProps {
  readonly auth: ItapAuthProvider;
  /** The organization the stored token is for; seeds the remembered facility. */
  readonly initialOrganizationId?: string | null;
  /** The token store behind `auth`, watched for sign-outs the framework does not see. */
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
}

/** The console under a router the caller provides (the browser's, or a memory router in tests). */
export function ConsoleApp({ auth, initialOrganizationId = null, store }: ConsoleAppProps): React.ReactElement {
  return (
    <ReactRouterAdapter>
      <LinkComponentProvider linkComponent={RouterLink}>
        <AppRuntime auth={auth} initialOrganizationId={initialOrganizationId} store={store}>
          <ConsoleRoutes />
        </AppRuntime>
      </LinkComponentProvider>
    </ReactRouterAdapter>
  );
}

/** The browser entry: the console over the page's session. */
export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <ConsoleApp
        auth={authProvider}
        store={tokenStore}
        initialOrganizationId={tokenStore.snapshot().org?.organizationId ?? null}
      />
    </BrowserRouter>
  );
}
