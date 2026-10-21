import { useT } from '@burojs/react';
import { AuthPage, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ShellProvider } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { useConsoleBrand } from '../app/brand';

/**
 * Shown when the signed-in user's identity (memberships) could not be read
 * for a transient reason: a retry, never "no organization" and never a
 * sign-out.
 */
export function IdentityRetry({ onRetry }: { onRetry: () => void }): React.ReactElement {
  const t = useT();
  const brand = useConsoleBrand();
  return (
    <ShellProvider brand={brand}>
      <AuthPage>
        <Card className="mx-auto w-full max-w-sm" role="alert">
          <CardHeader className="space-y-1.5 text-center">
            <CardTitle className="text-xl">{t('console.identityFailed.title')}</CardTitle>
            <CardDescription>{t('console.identityFailed.body')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={onRetry}>
              {t('console.retry')}
            </Button>
          </CardContent>
        </Card>
      </AuthPage>
    </ShellProvider>
  );
}
