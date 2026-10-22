import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { NOTIFICATION_CONDITIONS_FIELD } from './notification-conditions';
import { NotificationConditionsDisplay } from './notification-conditions-display';
import { NotificationConditionsInput } from './notification-conditions-input';

/** The `itap.notification-conditions` input and display, for `composeFieldImplementations`. */
export const notificationConditionsImplementations = {
  [NOTIFICATION_CONDITIONS_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: NotificationConditionsInput,
    Display: NotificationConditionsDisplay,
    layout: { size: 'full' },
  }),
};
