import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { profile } from './profile';
import { profileActivity, profileActivityOperation } from './profile-activity';
import { profileFields } from './profile-fields';

/**
 * People: the profiles of known people (employees, visitors, contractors, VIPs) with their
 * activity over the last 30 days. Later tasks add documents, consent, identities and visits.
 */
export const peopleModule = {
  name: 'people-module',
  uses: [profile, profileActivity],
  tables: {
    [PROFILE_RESOURCE]: hasuraTable('profiles', { selectFields: selectFieldsOf(profileFields) }),
  },
  operations: [profileActivityOperation],
} as const satisfies ConsoleModule;
