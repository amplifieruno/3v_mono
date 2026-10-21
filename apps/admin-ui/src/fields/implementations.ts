import { composeFieldImplementations } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { storageFileImplementations } from './storage-file-impl';

/**
 * The console's field implementations: the kit's, plus the hasura-storage file
 * field (`itap.storage-file`). Handed to `<BuroProvider fieldImplementations>`
 * and to `checkApp`, which checks each literal `meta` against its schema.
 */
export const itapFieldImplementations = composeFieldImplementations(
  shadcnFieldImplementations,
  storageFileImplementations,
);
