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
    doc: { topics: { index: 'Devices, credentials, health, recognition and coverage' } },
  },
  device_area: {
    doc: { topics: { index: 'Areas a device also covers' } },
  },
  device_health_metric: {
    doc: { topics: { index: 'Device health samples and the health chart' } },
  },
  device_event: {
    doc: { topics: { index: 'Device events' } },
  },
  profile: {
    doc: {
      topics: {
        index: 'Profiles: types, status, clearance and activity',
        'profiles-and-identities': 'Profiles and identities',
      },
    },
  },
  profile_document: {
    doc: { topics: { index: 'Profile documents: upload and audited opening' } },
  },
  consent_record: {
    doc: { topics: { index: 'Consent: recording, withdrawing and its effects' } },
  },
  identity: {
    doc: {
      topics: {
        index: 'Identities: sources, photos, enrollment and the profile link',
        governance: 'Merging, splitting, verifying and relating identities; the timeline',
      },
    },
  },
  identity_merge: {
    doc: { topics: { index: 'Identity merges and rolling them back' } },
  },
  identity_duplicate_candidate: {
    doc: { topics: { index: 'Identity duplicates: comparing, merging, dismissing' } },
  },
  verification_request: {
    doc: { topics: { index: 'Verification requests: asking, approving, rejecting' } },
  },
  identity_relationship: {
    doc: { topics: { index: 'Identity relationships' } },
  },
  profile_duplicate_candidate: {
    doc: { topics: { index: 'Profile duplicates: comparing, merging, dismissing' } },
  },
  visit: {
    doc: { topics: { index: 'Visits: scheduling, check-in, check-out and cancelling' } },
  },
  detection: {
    doc: { topics: { index: 'Detections: faces, people and erased rows' } },
  },
  tracking_session: {
    doc: { topics: { index: 'Tracking sessions and their paths' } },
  },
  identity_location: {
    doc: { topics: { index: 'Locations: the steps of a path' } },
  },
  area_occupancy: {
    doc: { topics: { index: 'Who is where and occupancy now' } },
  },
} satisfies TranslationBundle;
