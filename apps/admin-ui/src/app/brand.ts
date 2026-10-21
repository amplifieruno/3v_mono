import { useT } from '@burojs/react';
import type { ShellBrand } from '@burojs/ui-shadcn';
import * as React from 'react';

export const HOME_PATH = '/dashboard';

/** The console's brand for the shell and the auth pages, in the active language. */
export function useConsoleBrand(): ShellBrand {
  const t = useT();
  const name = t('console.brand');
  const subtitle = t('console.subtitle');
  return React.useMemo(() => ({ name, subtitle, homePath: HOME_PATH }), [name, subtitle]);
}
