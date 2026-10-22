import { useT } from '@burojs/react';
import type * as React from 'react';
import type { PlanContextState } from './plan-context';

/** Why a plan-space input cannot draw yet: no facility, no plan, loading or a failed read. */
export function PlanStateNote({
  state,
}: {
  readonly state: Exclude<PlanContextState, { readonly status: 'ready' }>;
}): React.ReactElement {
  const t = useT();
  const tone = state.status === 'error' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <p className={`text-sm ${tone}`} data-testid="plan-state">
      {t(`console.planCanvas.${state.status}`)}
    </p>
  );
}
