import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import { BINDING_RULES } from './application-rules';
import { BINDINGS, type BindingKind, type BindingSpec, TARGET_READ_FIELDS } from './binding-targets';

/*
 * The bindings of a client application (`client_application_segments`, `_facilities`,
 * `_access_points`, `_modes`, `_attributes`): one junction resource per kind, listed on the
 * application's page and removed there. A binding is added by the application's flow of its
 * kind (`./binding-flows.ts`), not by the list's create: the flow's custom insert can say why the
 * database refused it (a sandbox binding a facility, a duplicate), a resource create cannot
 * (`tasks/ui/buro-gaps.md` G78). Bindings describe the application, not a place, so the sidebar
 * facility never narrows them. A revoked application's bindings are not removed either
 * (`BINDING_RULES`, over `application { status }` selected with each row).
 */

const common = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  application_id: f.relation({
    to: CLIENT_APPLICATION_RESOURCE,
    required: true,
    write: 'never',
    providerOptions: { relationship: 'application' },
    texts: { label: 'Application', doc: { summary: 'The client application the binding belongs to.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

/** The fields of one kind's junction resource. */
export function bindingFields<K extends BindingKind>(kind: K): typeof common & (typeof TARGET_READ_FIELDS)[K] {
  return { ...common, ...TARGET_READ_FIELDS[kind] };
}

function bindingResource(spec: BindingSpec) {
  const fields = bindingFields(spec.kind);
  return defineResource(spec.resource, {
    texts: {
      label: `Application ${spec.label.toLowerCase()}`,
      labelPlural: `Application ${spec.labelPlural.toLowerCase()}`,
      doc: { summary: spec.summary },
    },
    basePath: spec.basePath,
    displayField: spec.column as keyof typeof fields & string,
    data: { provider: 'hasura' },
    operations: { create: false, edit: false },
    builtinActions: { edit: false },
    fields,
    rules: BINDING_RULES,
    views: {
      list: { page: false, columns: [spec.column as keyof typeof fields & string, 'created_at'] },
      show: { page: false },
    },
  });
}

/** The five junction resources, in the order of {@link BINDINGS}. */
export const BINDING_RESOURCES = BINDINGS.map(bindingResource);
