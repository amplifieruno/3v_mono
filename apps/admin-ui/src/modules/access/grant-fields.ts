import { f } from '@burojs/field-types';
import { ACCESS_POINT_RESOURCE, AREA_RESOURCE, PROFILE_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { grantUse } from '../../fields/grant-use';

const member = (label: string, summary: string) =>
  f.relation({ to: USER_RESOURCE, system: true, nullable: true, in: ['list', 'show'], open: 'none', texts: { label, doc: { summary } } });

/**
 * Columns of `itap.access_grants` the `org_admin` role reads. A grant is written once, at
 * create (person, area or access point, validity, single use, reason); afterwards only the
 * engine marks a single-use grant used and only "Revoke" ends it early (`revoke_access_grant`).
 */
export const accessGrantFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: { label: 'Person', doc: { summary: 'Whom the grant lets through. Their face or badge is recognised at the door as usual.' } },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Area',
      description: 'Or an access point, not both.',
      doc: { summary: 'Every door leading into this area or the areas inside it. Choose an area or a single access point, not both.' },
    },
  }),
  access_point_id: f.relation({
    to: ACCESS_POINT_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Access point',
      description: 'Or an area, not both.',
      doc: { summary: 'One single door, turnstile or gate. Choose an access point or an area, not both.' },
    },
  }),
  valid_from: dateTime({
    required: true,
    texts: { label: 'Valid from', doc: { summary: 'Before this moment the grant opens nothing.' } },
  }),
  valid_until: dateTime({
    required: true,
    texts: { label: 'Valid until', doc: { summary: 'From this moment on the grant opens nothing (terminals enforce it themselves). After Valid from.' } },
  }),
  single_use: f.boolean({
    default: false,
    write: 'create',
    texts: {
      label: 'Single use',
      doc: {
        summary:
          'Opens one door once: the first door it decides at consumes it (it then reads Used). Checked centrally only, never sent to terminals.',
      },
    },
  }),
  reason: f.text({
    nullable: true,
    write: 'create',
    texts: { label: 'Reason', doc: { summary: 'Why the person needs the access (a visit, a repair, a delivery); kept with the grant and in the audit log.' } },
  }),
  used_at: grantUse({
    texts: {
      label: 'Use',
      doc: {
        summary: 'A single-use grant reads Unused until a door consumed it, then Used with the moment. A reusable grant is never marked used.',
      },
    },
  }),
  granted_by: member('Granted by', 'The member who created the grant.'),
  created_at: dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Granted', doc: { summary: 'When the grant was created.' } } }),
  revoked_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Revoked', doc: { summary: 'When the grant was revoked; from then on it opens nothing. Empty while it is not revoked.' } },
  }),
  revoked_by: member('Revoked by', 'The member who revoked the grant.'),
  revoke_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Revoke reason', doc: { summary: 'Why the grant was revoked, as given by the member who revoked it.' } },
  }),
};

/** The columns of the grant lists. */
export const GRANT_COLUMNS = ['profile_id', 'area_id', 'access_point_id', 'valid_from', 'valid_until', 'single_use', 'used_at', 'revoked_at'] as const;
