import { Authenticated, ErrorComponent, Refine } from '@refinedev/core';
import { DevtoolsPanel, DevtoolsProvider } from '@refinedev/devtools';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import React, { FC } from 'react';

import routerBindings, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from '@refinedev/react-router';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { Layout } from './components/layout';
import { Login } from '../pages/login';
import { DetectionDebugPage } from '../pages/detection-debug/detection-debug-page';
// import { authProvider } from '../shared/auth/authProvider';
// import { TooltipProvider } from '../shadcn/components/ui/tooltip';
// import { ThemeProvider } from '../shadcn/components/ThemeProvider';
// import hasuraDataProvider from '@/shared/api/hasuraApi/hasuraDataProvider';
// import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/api/query-client';
import { Toaster } from '@/components/ui/sonner';
import { notificationProvider } from './notificationsProvider';
import { identityConfig } from '@/resources/identity/resourceConfig';
import { IdentityRouter } from '@/resources/identity/router';
import { profileConfig } from '@/resources/profile/resourceConfig';
import { ProfileRouter } from '@/resources/profile/router';
import { gqlClient } from '@/shared/api';
import dataProvider from '@refinedev/hasura';
import { ThemeProvider } from '@/components/refine-ui/theme/theme-provider';
import { authProvider } from '@/shared/auth';
import { TooltipProvider } from '@/components/ui/tooltip';

const hasuraDataProvider = dataProvider(gqlClient);
const appDataProvider = {
  default: hasuraDataProvider,
  hasura: hasuraDataProvider,
};

const App: FC = () => {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <RefineKbarProvider>
          <DevtoolsProvider>
            <ThemeProvider defaultTheme='dark'>
              <Refine
                dataProvider={appDataProvider}
                routerProvider={routerBindings}
                authProvider={authProvider}
                notificationProvider={notificationProvider}
                resources={[identityConfig, profileConfig]}
                options={{
                  // reactQuery: {
                  //   clientConfig: queryClient,
                  // },
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  // useNewQueryKeys: true,

                  projectId: 'M0KLZQ-hErFkK-x5o1tu',
                }}
              >
                <TooltipProvider>
                  <Routes>
                    <Route
                      element={
                        <Authenticated
                          key='authenticated-inner'
                          fallback={<CatchAllNavigate to='/login' />}
                        >
                          <Layout>
                            <Outlet />
                          </Layout>
                        </Authenticated>
                      }
                    >
                      {/* <Route index element={<DashboardPage />} /> */}
                      <Route
                        index
                        element={
                          <NavigateToResource resource='itap_identities' />
                        }
                      />

                      {/* Resouces */}
                      <Route
                        path={`/${identityConfig.list}/*`}
                        element={<IdentityRouter />}
                      />
                      <Route
                        path={`/${profileConfig.list}/*`}
                        element={<ProfileRouter />}
                      />

                      {/* Custom pages */}
                      <Route
                        path='/face-detection-debug'
                        element={<DetectionDebugPage />}
                      />

                      <Route path='*' element={<ErrorComponent />} />
                    </Route>
                    <Route
                      element={
                        <Authenticated
                          key='authenticated-outer'
                          fallback={<Outlet />}
                        >
                          <NavigateToResource />
                        </Authenticated>
                      }
                    >
                      <Route path='/login' element={<Login />} />
                    </Route>
                  </Routes>
                </TooltipProvider>
                <RefineKbar />
                <UnsavedChangesNotifier />
                <DocumentTitleHandler />
                <Toaster position='bottom-center' />
              </Refine>
            </ThemeProvider>
            <DevtoolsPanel />
          </DevtoolsProvider>
        </RefineKbarProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export default App;
