import { useDataRuntime, useIdentity, useT } from '@burojs/react';
import { ScopeSwitcher, SidebarBrand, toast } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { ItapIdentity } from '../auth';
import { useConsole } from './console-context';
import { performOrganizationSwitch } from './scope';

/**
 * The sidebar header: the current organization and the user's other active
 * memberships. A refused switch is reported with the server's message and the
 * switcher keeps showing the organization the token is still for.
 */
export function OrganizationSwitcher(): React.ReactElement {
  const t = useT();
  const { auth } = useConsole();
  const { dataSession } = useDataRuntime();
  const { data: identity } = useIdentity<ItapIdentity>();
  if (!identity?.organizationId) return <SidebarBrand />;

  const current = identity.organizationId;
  const options = identity.memberships
    .filter((membership) => membership.status === 'active' || membership.organizationId === current)
    .map((membership) => ({ value: membership.organizationId, label: membership.name }));

  const onChange = async (organizationId: string): Promise<void> => {
    if (organizationId === current) return;
    const result = await performOrganizationSwitch(auth, dataSession, organizationId);
    if (!result.success) toast.error(result.error.message);
  };

  return (
    <ScopeSwitcher label={t('console.organization')} options={options} value={current} onChange={onChange} />
  );
}
