import { composeFieldImplementations } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { areaShapeImplementations } from './area-shape-impl';
import { bulkFieldImplementations } from './bulk-fields-impl';
import { cronImplementations } from './cron-impl';
import { customFieldsImplementations } from './custom-fields-impl';
import { dashboardWidgetsImplementations } from './dashboard-widgets-impl';
import { dateTimeImplementations } from './date-time-impl';
import { detectionFaceImplementations } from './detection-face-impl';
import { grantUseImplementations } from './grant-use-impl';
import { eventRuleParametersImplementations } from './event-rule-parameters-impl';
import { facePhotosImplementations } from './face-photos-impl';
import { imageSizeImplementations } from './image-size-impl';
import { incidentActivityDetailsImplementations } from './incident-activity-details-impl';
import { inlineFileImplementations } from './inline-file-impl';
import { auditRecordImplementations } from './audit-record-impl';
import { integrationConfigImplementations } from './integration-config-impl';
import { notificationConditionsImplementations } from './notification-conditions-impl';
import { planPositionImplementations } from './plan-position-impl';
import { recordScopedRelationImplementations } from './record-scoped-relation-impl';
import { sandboxIdentityImplementations } from './sandbox-identity-impl';
import { reportParametersImplementations } from './report-parameters-impl';
import { searchFiltersImplementations } from './search-filters-impl';
import { secretImplementations } from './secret-impl';
import { segmentConditionsImplementations } from './segment-conditions-impl';
import { storageFileImplementations } from './storage-file-impl';
import { splitPhotosImplementations } from './split-photos-impl';
import { stringListImplementations } from './string-list-impl';
import { templateStructureImplementations } from './template-structure-impl';
import { timeWindowsImplementations } from './time-windows-impl';
import { timezoneImplementations } from './timezone-impl';
import { workspacePanelsImplementations } from './workspace-panels-impl';

/**
 * The console's field implementations: the kit's, plus the hasura-storage file
 * field (`itap.storage-file`), time zones (`itap.timezone`), weekly time windows
 * (`itap.time-windows`), lists of texts (`itap.string-list`), custom attribute
 * values (`itap.custom-fields`), floor-plan shapes and points (`itap.area-shape`,
 * `itap.plan-position`), image sizes (`itap.image-size`), facility template trees
 * (`itap.template-structure`), relation selects read in a given record scope
 * (`itap.record-scoped-relation`), identity selects narrowed to synthetic identities for a sandbox
 * application (`itap.sandbox-identity`), write-only secrets (`itap.secret`), files sent inside an
 * action's input (`itap.inline-file`), face photos for the enrollment actions (`itap.face-photos`),
 * the photos to split off an identity (`itap.split-photos`), timestamps with their time of day
 * (`itap.date-time`), a detection’s face (`itap.detection-face`), an access grant’s use (`itap.grant-use`), an event rule version's parameters
 * by rule type (`itap.event-rule-parameters`), an incident activity's details in one line
 * (`itap.incident-activity-details`), an operator workspace's panels (`itap.workspace-panels`) and a
 * notification rule's conditions (`itap.notification-conditions`) and a segment's conditions
 * (`itap.segment-conditions`) and a dashboard's widgets (`itap.dashboard-widgets`), a report schedule's cron with its sentence
 * (`itap.cron`), a report's or template's parameters (`itap.report-parameters`) and a search's filters
 * in words (`itap.search-filters`), and a bulk job's error sentences, options and search photos
 * (`itap.bulk-error`, `itap.bulk-options`, `itap.bulk-search-photos`), and an integration's settings or
 * field mapping in words (`itap.integration-config`, display only), and an audit entry's record as a
 * link to its page (`itap.audit-record`, display only).
 * Handed to `<BuroProvider fieldImplementations>` and to `checkApp`, which
 * checks each literal `meta` against its schema.
 */
export const itapFieldImplementations = composeFieldImplementations(
  shadcnFieldImplementations,
  storageFileImplementations,
  timezoneImplementations,
  integrationConfigImplementations,
  auditRecordImplementations,
  timeWindowsImplementations,
  stringListImplementations,
  customFieldsImplementations,
  areaShapeImplementations,
  planPositionImplementations,
  imageSizeImplementations,
  templateStructureImplementations,
  recordScopedRelationImplementations,
  sandboxIdentityImplementations,
  secretImplementations,
  inlineFileImplementations,
  facePhotosImplementations,
  splitPhotosImplementations,
  dateTimeImplementations,
  detectionFaceImplementations,
  grantUseImplementations,
  eventRuleParametersImplementations,
  incidentActivityDetailsImplementations,
  workspacePanelsImplementations,
  notificationConditionsImplementations,
  segmentConditionsImplementations,
  dashboardWidgetsImplementations,
  cronImplementations,
  reportParametersImplementations,
  searchFiltersImplementations,
  bulkFieldImplementations,
);
