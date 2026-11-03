import { type FlowConfig, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { DEVICE_RESOURCE } from '../../data/resource-names';

/**
 * "Remove password": clears the device account's stored password. A flow, not a button on the
 * form: an edit sends only what changed against the record it read, and the write-only column is
 * never read, so a form cannot tell "clear it" from "leave it" (buro 0.7, A94). The input is
 * written as it stands. Resending is harmless: the column stays empty.
 */
export const clearPasswordFlow = {
  texts: {
    label: 'Remove password',
    confirm: 'Remove the stored password? The console can no longer sign in to the device until a new one is set.',
    notify: 'The password is removed.',
    doc: { summary: 'Removes the stored device password, for example when it leaked or the account was retired.' },
  },
  icon: NAV_ICONS.clearSecret,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  confirm: true,
  submit: {
    update: DEVICE_RESOURCE,
    id: ref('record', 'id'),
    input: { password: { kind: 'literal', value: null } },
    reread: true,
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>>;
