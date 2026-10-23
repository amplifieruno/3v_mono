import { type FlowConfig, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { BIND_MUTATIONS } from './binding-ops';
import { BINDINGS, type BindingKind, type BindingSpec, TARGET_FORM_FIELDS } from './binding-targets';

const ICONS: Readonly<Record<BindingKind, string>> = {
  segment: NAV_ICONS.bindSegment,
  facility: NAV_ICONS.bindFacility,
  access_point: NAV_ICONS.bindAccessPoint,
  mode: NAV_ICONS.allowMode,
  attribute: NAV_ICONS.shareAttribute,
};

const DOCS: Readonly<Record<BindingKind, string>> = {
  segment:
    'Lets the application authenticate the segment’s members. Its population is the members of its segments and the people of its facilities together.',
  facility:
    'Lets the application authenticate the people of a facility: those an access policy or grant lets in there, or who were tracked there in the last 30 days. Not offered on a sandbox application.',
  access_point:
    'Makes the application serve a door: every session must then name one of its doors, and only people allowed through it are authenticated. Not offered on a sandbox application.',
  mode: 'Lets the application open sessions in this mode; a session in a mode it is not allowed is refused.',
  attribute: 'Lets the application receive this detail about the person with each success.',
};

/**
 * The add flow of one kind of binding on a client application: a form asking for the thing to
 * bind, then the kind's insert (`./binding-ops.ts`), whose refusals read as sentences on the form.
 * Facilities and access points are not offered on a sandbox application (a rule with the
 * reason, `./application-rules.ts`); a forced call is still refused by the database.
 */
function bindingFlow(spec: BindingSpec) {
  const fields = TARGET_FORM_FIELDS[spec.kind];
  return {
    texts: {
      label: spec.flowLabel,
      notify: `${spec.label} added.`,
      doc: { summary: DOCS[spec.kind] },
    },
    icon: ICONS[spec.kind],
    surfaces: { default: 'menu', show: 'menu' },
    form: { fields },
    submit: {
      mutation: BIND_MUTATIONS[spec.kind],
      // A lost answer is not retried: sent again, a binding that landed reads "already bound".
      retry: 'never',
      input: { applicationId: ref('record', 'id'), value: ref('values', spec.column) },
    },
    then: { notify: true },
  } satisfies FlowConfig<unknown, Record<never, never>, typeof fields>;
}

/** Every binding flow with its action name, in the order of {@link BINDINGS}. */
export const BINDING_FLOWS = BINDINGS.map((spec) => [spec.flow, bindingFlow(spec)] as const);
