import { fieldImplementation } from '@burojs/react';
import { SECRET_FIELD } from './secret';
import { SecretDisplay } from './secret-display';
import { SecretInput } from './secret-input';
import { secretMeta } from './secret-meta';

/** The `itap.secret` input and display, for `composeFieldImplementations`. */
export const secretImplementations = {
  [SECRET_FIELD]: fieldImplementation({
    meta: secretMeta,
    Input: SecretInput,
    Display: SecretDisplay,
  }),
};
