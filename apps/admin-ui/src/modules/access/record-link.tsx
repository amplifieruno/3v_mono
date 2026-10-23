import { resourceShowHref } from '@burojs/core';
import { useApp } from '@burojs/react';
import { useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';

export interface RecordLinkProps {
  readonly resource: string;
  readonly id: string | null;
  readonly name: string | undefined;
  /** Shown, muted, when the record has no id or its name is not known (deleted, or not visible). */
  readonly fallback: string;
}

/** A record's name as a link to its page, or the fallback text when the name is not known. */
export function RecordLink({ resource, id, name, fallback }: RecordLinkProps): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  if (id === null || name === undefined) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <Link href={resourceShowHref(app.registry, app.registry.get(resource), resource, id)} className="hover:underline">
      {name}
    </Link>
  );
}
