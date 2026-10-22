import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Tracking enums; values are the rows of the Hasura enum tables in `MONITORING_ENUM_TABLES`. */

export const TRACKING_SESSION_STATUS_ENUM = 'tracking_session_status';
export const MOVEMENT_TYPE_ENUM = 'movement_type';

export const TRACKING_SESSION_STATUSES = ['active', 'completed', 'lost', 'error'] as const;
export const MOVEMENT_TYPES = ['entry', 'exit', 'movement', 'stationary'] as const;

export const trackingSessionStatusEnum = defineEnum({
  name: TRACKING_SESSION_STATUS_ENUM,
  values: enumValues(TRACKING_SESSION_STATUSES, {
    active: 'success',
    completed: 'secondary',
    lost: 'warning',
    error: 'destructive',
  }),
  texts: {
    active: {
      label: 'Active',
      doc: { summary: 'The person is in the facility now: cameras keep extending the session.' },
    },
    completed: {
      label: 'Completed',
      doc: { summary: 'Ended after the person was last seen at an entry or exit of the facility.' },
    },
    lost: {
      label: 'Lost',
      doc: {
        summary:
          'Ended because no camera saw the person for the tracking timeout, and the last place was not an exit.',
      },
    },
    error: { label: 'Error', doc: { summary: 'Ended by a processing error.' } },
  },
});

export const movementTypeEnum = defineEnum({
  name: MOVEMENT_TYPE_ENUM,
  values: enumValues(MOVEMENT_TYPES, {
    entry: 'success',
    exit: 'secondary',
    movement: 'info',
    stationary: 'outline',
  }),
  texts: {
    entry: {
      label: 'Entry',
      doc: { summary: 'The first place of a session, or a door passed inwards.' },
    },
    exit: { label: 'Exit', doc: { summary: 'A door passed outwards.' } },
    movement: {
      label: 'Movement',
      doc: { summary: 'The person moved to another area, or passed a two-way door.' },
    },
    stationary: {
      label: 'Stationary',
      doc: { summary: 'An estimated place: the person stayed where they were.' },
    },
  },
});

/** Each enum above by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const MONITORING_ENUM_TABLES: Readonly<Record<string, string>> = {
  [TRACKING_SESSION_STATUS_ENUM]: 'tracking_session_statuses',
  [MOVEMENT_TYPE_ENUM]: 'movement_types',
};
