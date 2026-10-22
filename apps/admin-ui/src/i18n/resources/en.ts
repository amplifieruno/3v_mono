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
    doc: { topics: { index: 'Facilities, operating hours and custom attributes' } },
  },
} satisfies TranslationBundle;
