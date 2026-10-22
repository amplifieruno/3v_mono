import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { CRON_FIELD } from './cron';
import { CronDisplay } from './cron-display';
import { CronInput } from './cron-input';

/** The `itap.cron` input and display, for `composeFieldImplementations`. */
export const cronImplementations = {
  [CRON_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: CronInput,
    Display: CronDisplay,
  }),
};
