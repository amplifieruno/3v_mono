import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { SecretMeta } from './secret-meta';

/**
 * A password box for a write-only secret. It starts empty (the stored secret is never
 * read) and reports an empty box as `undefined`, so the form leaves the field out of
 * the payload and the stored secret stays as it is. On a stored record (an edit form: the
 * record has an `id`) "Remove the stored value" reports `null`, which the payload carries and
 * the nullable column stores; "Keep the stored value" undoes that. A secret that must stay set
 * (`removable: false`, a `NOT NULL` column) offers no removal.
 */
export function SecretInput(props: ScalarInputProps<unknown, SecretMeta>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues, record, meta } = props;
  const t = useT();
  const locked = disabled === true || readOnly === true;
  const removing = value === null;
  const stored = record !== undefined && record.id !== undefined && record.id !== null;
  const removable = meta?.removable !== false;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          autoComplete="new-password"
          id={accessibility.input}
          aria-describedby={accessibility.description}
          aria-invalid={issues.length > 0 || undefined}
          data-testid={testIds.input}
          className="max-w-sm"
          value={typeof value === 'string' ? value : ''}
          disabled={locked || removing}
          onChange={(event) => onChange?.(event.target.value === '' ? undefined : event.target.value)}
          onBlur={onBlur}
        />
        {stored && removable && !locked ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid={`${testIds.input}:remove`}
            onClick={() => onChange?.(removing ? undefined : null)}
          >
            {t(removing ? 'console.secret.keep' : 'console.secret.remove')}
          </Button>
        ) : null}
      </div>
      {removing ? <p className="text-muted-foreground text-sm">{t('console.secret.removing')}</p> : null}
    </div>
  );
}
