import type { ScalarInputProps } from '@burojs/react';
import { Input } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { SecretMeta } from './secret-meta';

/**
 * A password box for a write-only secret. It starts empty (the stored secret is never
 * read) and reports an empty box as `undefined`, so the form leaves the field out of
 * the payload and the stored secret stays as it is. Removing a stored secret is a flow of its own
 * (`clearPasswordFlow`): an edit form cannot say it, since the column is never read.
 */
export function SecretInput(props: ScalarInputProps<unknown, SecretMeta>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues } = props;
  const locked = disabled === true || readOnly === true;
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
          disabled={locked}
          onChange={(event) => onChange?.(event.target.value === '' ? undefined : event.target.value)}
          onBlur={onBlur}
        />
      </div>
    </div>
  );
}
