import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { INTEGRATION_CONFIG_FIELD } from './integration-config';
import { IntegrationConfigDisplay } from './integration-config-display';

/** The `itap.integration-config` display (the input stays the kit's JSON input), for `composeFieldImplementations`. */
export const integrationConfigImplementations = {
  [INTEGRATION_CONFIG_FIELD]: fieldImplementation({
    meta: z.object({ kind: z.enum(['config', 'mapping']) }),
    Display: IntegrationConfigDisplay,
  }),
};
