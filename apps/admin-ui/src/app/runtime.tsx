import { createResolver } from '@burojs/context';
import type { AppRuntime as BuroAppRuntime } from '@burojs/core';
import type { I18nFacade } from '@burojs/i18n-core';
import {
  BuroProvider,
  type DataRuntimeLease,
  type FieldImplementationCatalog,
  createDataRuntime,
  createDataRuntimeTransitionParticipant,
  createDataSession,
} from '@burojs/react';
import { Toaster, defaultNavLayouts, shadcnPresentationHosts } from '@burojs/ui-shadcn';
import * as React from 'react';
import type { ItapAuthProvider, TokenStore } from '../auth';
import { createItapQueryClient } from '../data/query-client';
import { docs } from '../docs';
import { itapFieldImplementations } from '../fields/implementations';
import { LANGUAGE_STORAGE_KEY, createI18n } from '../i18n/create-i18n';
import { buildLocaleRegistry } from '../i18n/registry';
import { createConsoleRuntime } from './app-definition';
import { appBlockImplementations } from './block-implementations';
import { ConsoleContext, type ItapResolver } from './console-context';
import { itapContextSlices } from './context-slices';
import { appFrameImplementations } from './frame-implementations';
import { IdentitySync } from './identity-sync';
import { initialScopeKey } from './scope';
import { SessionWatch } from './session-watch';

/** The slot registry handed to `<BuroProvider components>`. */
const components: Record<string, unknown> = { ...defaultNavLayouts };

interface Booted {
  readonly app: BuroAppRuntime;
  readonly resolver: ItapResolver;
  readonly i18n: I18nFacade;
  readonly lease: DataRuntimeLease;
}

async function boot(
  auth: ItapAuthProvider,
  organizationId: string | null,
): Promise<{ booted: Booted; dispose: () => Promise<void> }> {
  // The data provider reads the token from this mount's `auth`, the console's one token source.
  const app = createConsoleRuntime(() => auth.getToken());
  await app.ready;
  const resolver = createResolver(itapContextSlices());
  await resolver.boot();
  const scopeKey = initialScopeKey(organizationId);
  resolver.setSlice('scope', { organization: organizationId, facility: scopeKey.facility });
  const i18n = await createI18n(buildLocaleRegistry());
  const queryClient = createItapQueryClient();
  const dataSession = createDataSession({ scopeKey: { ...scopeKey } });
  const participant = createDataRuntimeTransitionParticipant({ app, queryClient });
  const unregister = dataSession.registerParticipant(participant);
  const lease = await createDataRuntime({ app, queryClient, dataSession, transitionParticipant: participant });
  return {
    booted: { app, resolver, i18n, lease },
    dispose: async () => {
      await lease.dispose();
      unregister();
      await dataSession.dispose();
    },
  };
}

export interface AppRuntimeProps {
  readonly auth: ItapAuthProvider;
  /** The organization the stored token is for; seeds the remembered facility scope. */
  readonly initialOrganizationId: string | null;
  /** The token store behind `auth`; its sign-outs end the UI session (`./session-watch.tsx`). */
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
  readonly fieldImplementations?: FieldImplementationCatalog;
  readonly children: React.ReactNode;
}

/**
 * Boots what `<BuroProvider>` needs (app ready, resolver, i18n, query client,
 * data session and data runtime) once per mount, renders nothing until then,
 * and disposes all of it on unmount.
 */
export function AppRuntime({
  auth,
  initialOrganizationId,
  store,
  fieldImplementations = itapFieldImplementations,
  children,
}: AppRuntimeProps): React.ReactElement | null {
  const [booted, setBooted] = React.useState<Booted | null>(null);
  const initialOrganization = React.useRef(initialOrganizationId);
  const initialAuth = React.useRef(auth);

  React.useEffect(() => {
    let cancelled = false;
    let dispose: (() => Promise<void>) | undefined;
    void boot(initialAuth.current, initialOrganization.current).then((result) => {
      dispose = result.dispose;
      if (cancelled) void result.dispose();
      else setBooted(result.booted);
    });
    return () => {
      cancelled = true;
      void dispose?.();
    };
  }, []);

  const context = React.useMemo(
    () => (booted ? { auth, resolver: booted.resolver, store } : null),
    [auth, booted, store],
  );

  if (!booted || !context) return null;

  return (
    <ConsoleContext.Provider value={context}>
      <BuroProvider
        app={booted.app}
        dataRuntime={booted.lease}
        authProvider={auth}
        resolver={booted.resolver}
        i18n={booted.i18n}
        languageStorageKey={LANGUAGE_STORAGE_KEY}
        docs={docs}
        components={components}
        presentationHosts={shadcnPresentationHosts}
        fieldImplementations={fieldImplementations}
        blockImplementations={appBlockImplementations}
        frameImplementations={appFrameImplementations}
      >
        <IdentitySync />
        {store ? <SessionWatch store={store} /> : null}
        {children}
        <Toaster position="bottom-right" />
      </BuroProvider>
    </ConsoleContext.Provider>
  );
}
