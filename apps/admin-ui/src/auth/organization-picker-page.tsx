import { useDataRuntime, useIdentity, useIsAuthenticated, useLogout, useT } from '@burojs/react';
import {
  AuthPage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ShellProvider,
  toast,
} from '@burojs/ui-shadcn';
import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { HOME_PATH, useConsoleBrand } from '../app/brand';
import { useConsole } from '../app/console-context';
import { performOrganizationSwitch } from '../app/scope';
import { IdentityRetry } from './identity-retry';
import { LOGIN_PATH, ORGANIZATIONS_PATH } from './require-auth';
import type { ItapIdentity, Membership } from './types';

function destination(state: unknown): string {
  const from = (state as { readonly from?: unknown } | null)?.from;
  return typeof from === 'string' && from !== LOGIN_PATH && from !== ORGANIZATIONS_PATH ? from : HOME_PATH;
}

function OrganizationChoices({ memberships }: { memberships: readonly Membership[] }): React.ReactElement {
  const { auth } = useConsole();
  const { dataSession } = useDataRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = React.useState<string | null>(null);

  const choose = async (organizationId: string): Promise<void> => {
    setPending(organizationId);
    try {
      const result = await performOrganizationSwitch(auth, dataSession, organizationId);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      navigate(destination(location.state), { replace: true });
    } finally {
      setPending(null);
    }
  };

  return (
    <CardContent className="flex flex-col gap-2">
      {memberships.map((membership) => (
        <Button
          key={membership.organizationId}
          variant="outline"
          className="justify-start"
          disabled={pending !== null}
          onClick={() => void choose(membership.organizationId)}
        >
          {membership.name}
        </Button>
      ))}
    </CardContent>
  );
}

function NoOrganization(): React.ReactElement {
  const t = useT();
  const { mutateAsync: logout } = useLogout();
  const navigate = useNavigate();
  return (
    <CardContent className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('console.organizations.noneBody')}</p>
      <Button
        variant="outline"
        onClick={() => void logout({}).then(() => navigate(LOGIN_PATH, { replace: true }))}
      >
        {t('console.signOut')}
      </Button>
    </CardContent>
  );
}

/**
 * Where a signed-in user without an organization lands: the active
 * memberships to choose from, or, with none, why the console cannot open.
 */
export function OrganizationPickerPage(): React.ReactElement | null {
  const t = useT();
  const brand = useConsoleBrand();
  const check = useIsAuthenticated();
  const identity = useIdentity<ItapIdentity>();

  if (check.status === 'pending') return null;
  if (check.data?.authenticated !== true) return <Navigate to={LOGIN_PATH} replace />;
  if (identity.status === 'pending') return null;
  if (identity.status === 'error') return <IdentityRetry onRetry={() => void identity.refetch()} />;
  if (!identity.data) return <Navigate to={LOGIN_PATH} replace />;

  const active = identity.data.memberships.filter((membership) => membership.status === 'active');
  const none = active.length === 0;

  return (
    <ShellProvider brand={brand}>
      <AuthPage>
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="space-y-1.5 text-center">
            <CardTitle className="text-xl">
              {none ? t('console.organizations.noneTitle') : t('console.organizations.title')}
            </CardTitle>
            {none ? null : <CardDescription>{t('console.organizations.description')}</CardDescription>}
          </CardHeader>
          {none ? <NoOrganization /> : <OrganizationChoices memberships={active} />}
        </Card>
      </AuthPage>
    </ShellProvider>
  );
}
