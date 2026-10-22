import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Label } from '@burojs/ui-shadcn';
import { X } from 'lucide-react';
import * as React from 'react';
import { CustomFieldControl } from './custom-field-control';
import { activeDefinitions, keptKeys, valuesOf, withAttribute } from './custom-fields-check';
import { useAttributeDefinitions } from './custom-fields-definitions';
import { formatAttributeValue } from './custom-fields-format';
import type { CustomFieldsMeta } from './custom-fields-meta';
import { publishCustomFields } from './custom-fields-registry';

/**
 * One labelled control per active attribute of the entity, by sort order; required ones
 * are marked. Values stored under keys no active attribute offers are listed below as
 * kept: an inactive attribute's value stays as it is, a value whose attribute is gone can
 * be removed (the database refuses to save custom fields that still hold it). Every edit
 * writes the whole object with all other keys untouched.
 */
export function CustomFieldsInput(
  props: ScalarInputProps<unknown, CustomFieldsMeta>,
): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, meta, issues } =
    props;
  const t = useT();
  const state = useAttributeDefinitions(meta.entity);
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'custom-fields';
  const fieldName = props.path[props.path.length - 1];
  // On an edit, the value the record holds: unchanged, it is not checked (as in the database).
  const stored =
    props.record !== undefined && typeof fieldName === 'string' ? props.record[fieldName] : undefined;

  // Republished only when what the validator reads changes (`state` is a new object per render).
  const definitions = state.status === 'ready' ? state.definitions : undefined;
  React.useEffect(() => {
    if (definitions === undefined) return undefined;
    return publishCustomFields(meta.entity, {
      definitions,
      ...(stored === undefined ? {} : { stored }),
    });
  }, [definitions, meta.entity, stored]);

  if (state.status === 'pending') {
    return <span className="text-sm text-muted-foreground">{t('console.customFields.loading')}</span>;
  }
  if (state.status === 'error') {
    return <span className="text-sm text-destructive">{t('console.customFields.failed')}</span>;
  }

  const values = valuesOf(value);
  const active = activeDefinitions(state.definitions);
  const kept = keptKeys(value, state.definitions);
  const words = { yes: t('console.customFields.yes'), no: t('console.customFields.no') };
  const write = (key: string, next: unknown): void => onChange?.(withAttribute(value, key, next));

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={testIds.input}
      aria-describedby={accessibility.description}
    >
      {active.length === 0 && kept.length === 0 ? (
        <span className="text-sm text-muted-foreground">{t('console.customFields.none')}</span>
      ) : null}
      {active.map((definition) => {
        const id = `${prefix}-${definition.key}`;
        return (
          <div key={definition.key} className="flex flex-col gap-1">
            <Label htmlFor={id}>
              {definition.label}
              {definition.required ? <span aria-hidden> *</span> : null}
            </Label>
            <CustomFieldControl
              definition={definition}
              value={values[definition.key]}
              onChange={(next) => write(definition.key, next)}
              {...(onBlur === undefined ? {} : { onBlur })}
              id={id}
              disabled={locked}
              invalid={issues.length > 0}
            />
          </div>
        );
      })}
      {kept.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('console.customFields.kept')}</span>
          {kept.map(({ key, definition }) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{definition?.label ?? key}</span>
              <span>{formatAttributeValue(values[key], words)}</span>
              <span className={definition === null ? 'text-destructive' : 'text-muted-foreground'}>
                {definition === null
                  ? t('console.customFields.removedNote')
                  : t('console.customFields.inactiveNote')}
              </span>
              {definition === null && !locked ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('console.customFields.remove', { params: { key } })}
                  onClick={() => write(key, undefined)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
