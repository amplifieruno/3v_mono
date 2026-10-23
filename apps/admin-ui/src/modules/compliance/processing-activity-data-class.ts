import { type Check, defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { resourceByName } from '../../data/resource-by-name';
import { PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE, PROCESSING_ACTIVITY_RESOURCE } from '../../data/resource-names';
import { RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM } from '../../enums/compliance';
import { enumField } from '../../enums/field';

/** Columns of `itap.processing_activity_data_classes` (insert and delete only; a row is never edited). */
export const activityDataClassFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  activity_id: f.relation({
    to: PROCESSING_ACTIVITY_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: { label: 'Processing activity', doc: { summary: 'The activity that processes this class of data.' } },
  }),
  data_class: enumField(RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Data class',
      doc: { summary: 'A class of personal data the activity processes, the same classes retention policies keep and purge; each class once per activity.' },
    },
  }),
  created_at: f.dateTime({ system: true, in: ['list'], texts: { label: 'Added', doc: { summary: 'When the class was added to the activity.' } } }),
};

/** Whether the activity already lists the class (the database refuses it twice: `processing_activity_data_classes_key`). */
export const ACTIVITY_DATA_CLASS_CHECKS: Check[] = [
  {
    id: 'activityDataClassTaken',
    severity: 'error',
    on: ['create'],
    anchor: 'data_class',
    texts: 'The activity already lists this data class.',
    when: async ({ values, data }) => {
      if (typeof values.activity_id !== 'string' || typeof values.data_class !== 'string') return false;
      try {
        const { data: rows } = await data.list(
          resourceByName(PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE) as never,
          {
            filter: {
              and: [
                { field: 'activity_id', op: 'eq', value: values.activity_id },
                { field: 'data_class', op: 'eq', value: values.data_class },
              ],
            },
            pagination: { kind: 'offset', page: 1, pageSize: 1 },
          } as never,
        );
        return Array.isArray(rows) && rows.length > 0;
      } catch {
        return false;
      }
    },
  },
];

/**
 * The data classes of a processing activity (`itap.processing_activity_data_classes`): the link
 * between a record of processing and the retention classes. Listed and added on the activity's
 * Data classes tab, removed one by one; never edited (buro 0.6 shows many-to-many links read-only,
 * so the junction is its own child list).
 */
export const processingActivityDataClass = defineResource(PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE, {
  texts: {
    label: 'Processed data class',
    labelPlural: 'Processed data classes',
    doc: { summary: 'A class of personal data a processing activity handles, such as detections or face templates, linking the record of processing to retention.' },
  },
  basePath: '/processing-activity-data-classes',
  displayField: 'data_class',
  data: { provider: 'hasura' },
  operations: { edit: false },
  builtinActions: { edit: false },
  fields: activityDataClassFields,
  checks: ACTIVITY_DATA_CLASS_CHECKS,
  views: {
    list: { page: false, columns: ['data_class', 'created_at'] },
    show: { page: false },
    create: { body: () => ['activity_id', 'data_class'] },
  },
});
