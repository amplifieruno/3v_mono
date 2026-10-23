import { type Layout, type ScreenRef, ref } from '@burojs/core';
import { legalHoldNoticeBlock } from './hold-notice-block';

/** Any screen's field map: the notice reads only record columns by name. */
type Fields = Readonly<Record<string, unknown>>;

/** A record ref for a layout typed by another resource's fields (the notice serves three). */
const column = (name: string) => ref('record', name) as unknown as ScreenRef<'record'>;

/** The legal hold notice heading a profile page: holds on the person or on one of their identities. */
export function profileHoldNotice<F extends Fields>(l: Layout<F>) {
  return l.place(legalHoldNoticeBlock, { key: 'legal-hold-notice', props: { profileId: column('id') } });
}

/** The legal hold notice heading an identity page: holds on the identity or on its profile. */
export function identityHoldNotice<F extends Fields>(l: Layout<F>) {
  return l.place(legalHoldNoticeBlock, {
    key: 'legal-hold-notice',
    props: { identityId: column('id'), linkedProfileId: column('profile_id') },
  });
}

/** The legal hold notice heading an incident page: holds on the incident or on its facility. */
export function incidentHoldNotice<F extends Fields>(l: Layout<F>) {
  return l.place(legalHoldNoticeBlock, {
    key: 'legal-hold-notice',
    props: { incidentId: column('id'), facilityId: column('facility_id') },
  });
}
