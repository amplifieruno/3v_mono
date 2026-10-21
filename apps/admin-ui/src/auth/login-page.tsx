import { useLogin } from '@burojs/react';
import { AuthPage, type LoginCredentials, LoginForm, ShellProvider } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { HOME_PATH, useConsoleBrand } from '../app/brand';
import { LOGIN_PATH } from './require-auth';

/** Where a successful sign-in lands: the page the guard came from, else the dashboard. */
function destination(state: unknown): string {
  const from = (state as { readonly from?: unknown } | null)?.from;
  return typeof from === 'string' && from !== LOGIN_PATH ? from : HOME_PATH;
}

/**
 * Email and password sign-in, outside the shell. `useLogin()` resolves with
 * the provider's `AuthResult`; `<LoginForm>` shows an error only for a
 * rejection, so a refusal is rethrown with the server's message.
 */
export function LoginPage(): React.ReactElement {
  const { mutateAsync: login } = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const brand = useConsoleBrand();

  const onSubmit = async (credentials: LoginCredentials): Promise<void> => {
    const result = await login(credentials);
    if (!result.success) throw new Error(result.error.message);
    navigate(destination(location.state), { replace: true });
  };

  return (
    <ShellProvider brand={brand}>
      <AuthPage>
        <LoginForm onSubmit={onSubmit} />
      </AuthPage>
    </ShellProvider>
  );
}
