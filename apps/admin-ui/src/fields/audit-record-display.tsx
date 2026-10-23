import { resourceShowHref } from '@burojs/core';
import { type ScalarDisplayProps, useApp } from '@burojs/react';
import { useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { auditEntityResource } from '../data/audit-entities';
import { auditRecordName } from '../modules/compliance/audit-diff-format';

type Meta = { readonly entityField: string; readonly actionField: string; readonly changesField: string };

/** The audited record: a link to its page when it has one and still exists, its name or id otherwise. */
export function AuditRecordDisplay(props: ScalarDisplayProps<unknown, Meta>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const id = typeof props.value === 'string' && props.value !== '' ? props.value : null;
  if (id === null) {
    return (
      <span className="text-muted-foreground" data-testid={props.testIds.display}>
        —
      </span>
    );
  }
  const record = props.record ?? {};
  const name = auditRecordName(record[props.meta.changesField]) ?? `${id.slice(0, 8)}…`;
  const resource = auditEntityResource(record[props.meta.entityField]);
  let href: string | null = null;
  if (resource !== null && record[props.meta.actionField] !== 'delete' && app.registry.get(resource) !== undefined) {
    try {
      href = resourceShowHref(app.registry, app.registry.get(resource), resource, id);
    } catch {
      href = null;
    }
  }
  if (href === null) {
    return (
      <span className="text-sm" title={id} data-testid={props.testIds.display} data-linked="false">
        {name}
      </span>
    );
  }
  return (
    <Link href={href} className="text-sm hover:underline" data-testid={props.testIds.display} data-linked="true">
      {name}
    </Link>
  );
}
