import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * The `resources` namespace (English, primary): per-resource documentation
 * the declarations do not carry, such as article titles
 * (`<resource>.doc.topics.<topicId>`). Labels and `doc.summary` texts live on
 * the declarations themselves (`texts`); translations of them go into the
 * other locales' files beside this one.
 */
export default {
  organization_member: {
    doc: { topics: { members: 'Members and invitations' } },
  },
  organization_settings: {
    doc: { topics: { index: 'Organization settings' } },
  },
  company: {
    doc: { topics: { index: 'Companies' } },
  },
  work_schedule: {
    doc: { topics: { index: 'Work schedules and time windows' } },
  },
  custom_attribute_definition: {
    doc: { topics: { index: 'Custom attributes' } },
  },
  facility: {
    doc: { topics: { index: 'Facilities, operating hours, custom attributes and templates' } },
  },
  area: {
    doc: { topics: { index: 'Areas and the area tree' } },
  },
  floor_plan: {
    doc: { topics: { index: 'Floor plans and area shapes' } },
  },
  access_point: {
    doc: { topics: { index: 'Access points, positions and devices' } },
  },
  access_point_device: {
    doc: { topics: { index: 'Devices bound to access points' } },
  },
  facility_template: {
    doc: { topics: { index: 'Facility templates and their structure' } },
  },
  device: {
    doc: { topics: { index: 'Devices, credentials, health and coverage' } },
  },
  device_area: {
    doc: { topics: { index: 'Areas a device also covers' } },
  },
} satisfies TranslationBundle;
