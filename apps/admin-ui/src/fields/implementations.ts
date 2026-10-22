import { composeFieldImplementations } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { customFieldsImplementations } from './custom-fields-impl';
import { storageFileImplementations } from './storage-file-impl';
import { stringListImplementations } from './string-list-impl';
import { timeWindowsImplementations } from './time-windows-impl';
import { timezoneImplementations } from './timezone-impl';

/**
 * The console's field implementations: the kit's, plus the hasura-storage file
 * field (`itap.storage-file`), time zones (`itap.timezone`), weekly time windows
 * (`itap.time-windows`), lists of texts (`itap.string-list`) and custom attribute
 * values (`itap.custom-fields`). Handed to `<BuroProvider fieldImplementations>`
 * and to `checkApp`, which checks each literal `meta` against its schema.
 */
export const itapFieldImplementations = composeFieldImplementations(
  shadcnFieldImplementations,
  storageFileImplementations,
  timezoneImplementations,
  timeWindowsImplementations,
  stringListImplementations,
  customFieldsImplementations,
);
