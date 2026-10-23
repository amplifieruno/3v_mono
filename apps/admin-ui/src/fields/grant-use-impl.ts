import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { GRANT_USE_FIELD } from './grant-use';
import { GrantUseDisplay } from './grant-use-display';

/** The `itap.grant-use` display (no input: the column is written by the access engine only). */
export const grantUseImplementations = {
  [GRANT_USE_FIELD]: fieldImplementation({
    meta: z.object({}),
    Display: GrantUseDisplay,
  }),
};
