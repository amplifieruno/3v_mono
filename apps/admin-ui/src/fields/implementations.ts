import { composeFieldImplementations } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { areaShapeImplementations } from './area-shape-impl';
import { customFieldsImplementations } from './custom-fields-impl';
import { imageSizeImplementations } from './image-size-impl';
import { planPositionImplementations } from './plan-position-impl';
import { storageFileImplementations } from './storage-file-impl';
import { stringListImplementations } from './string-list-impl';
import { templateStructureImplementations } from './template-structure-impl';
import { timeWindowsImplementations } from './time-windows-impl';
import { timezoneImplementations } from './timezone-impl';

/**
 * The console's field implementations: the kit's, plus the hasura-storage file
 * field (`itap.storage-file`), time zones (`itap.timezone`), weekly time windows
 * (`itap.time-windows`), lists of texts (`itap.string-list`), custom attribute
 * values (`itap.custom-fields`), floor-plan shapes and points (`itap.area-shape`,
 * `itap.plan-position`), image sizes (`itap.image-size`) and facility template trees
 * (`itap.template-structure`). Handed to `<BuroProvider fieldImplementations>`
 * and to `checkApp`, which checks each literal `meta` against its schema.
 */
export const itapFieldImplementations = composeFieldImplementations(
  shadcnFieldImplementations,
  storageFileImplementations,
  timezoneImplementations,
  timeWindowsImplementations,
  stringListImplementations,
  customFieldsImplementations,
  areaShapeImplementations,
  planPositionImplementations,
  imageSizeImplementations,
  templateStructureImplementations,
);
