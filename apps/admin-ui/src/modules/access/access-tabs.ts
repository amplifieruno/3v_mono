import { type Layout, type ScreenRef, ref, relatedList } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_DECISION_RESOURCE, ACCESS_GRANT_RESOURCE } from '../../data/resource-names';
import { DECISION_RELATED_COLUMNS } from './decision-fields';
import { GRANT_COLUMNS } from './grant-fields';

/** Any screen's field map: the panels read only the record's `id`. */
type Fields = Readonly<Record<string, unknown>>;

/** A record ref for a layout typed by another resource's fields (the panels serve several). */
const recordId = ref('record', 'id') as unknown as ScreenRef<'record'>;

/** The record's grants (also seeds "+ Create": a new grant is for this person or door). */
function grantsList<F extends Fields>(l: Layout<F>, key: string, field: 'profile_id' | 'access_point_id') {
  return l.place(relatedList(resourceByName(ACCESS_GRANT_RESOURCE)), {
    key,
    texts: { title: 'Access grants' },
    props: { where: [{ field, op: 'eq', value: recordId }], columns: GRANT_COLUMNS.filter((column) => column !== field), open: 'page' },
  });
}

/** The record's decisions, newest first. */
function decisionsList<F extends Fields>(l: Layout<F>, key: string, field: 'profile_id' | 'access_point_id' | 'policy_version_id') {
  return l.place(relatedList(resourceByName(ACCESS_DECISION_RESOURCE)), {
    key,
    texts: { title: 'Access decisions' },
    props: {
      where: [{ field, op: 'eq', value: recordId }],
      columns: DECISION_RELATED_COLUMNS.filter((column) => column !== field),
      open: 'page',
    },
  });
}

/** A person's Access tab: their grants, then the doors' decisions about them. */
export function profileAccessPanel<F extends Fields>(l: Layout<F>) {
  return l.panel([grantsList(l, 'profile-grants', 'profile_id'), decisionsList(l, 'profile-decisions', 'profile_id')], {
    key: 'access',
    texts: 'Access',
  });
}

/** An access point's Access tab: its grants, then its decisions. */
export function accessPointAccessPanel<F extends Fields>(l: Layout<F>) {
  return l.panel(
    [grantsList(l, 'access-point-grants', 'access_point_id'), decisionsList(l, 'access-point-decisions', 'access_point_id')],
    { key: 'access', texts: 'Access' },
  );
}

/** A policy version's Decisions tab: the decisions it decided. */
export function versionDecisionsPanel<F extends Fields>(l: Layout<F>) {
  return l.panel([decisionsList(l, 'version-decisions', 'policy_version_id')], { key: 'decisions', texts: 'Decisions' });
}
