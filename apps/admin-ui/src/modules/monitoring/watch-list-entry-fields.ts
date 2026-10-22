import { f } from '@burojs/field-types';
import {
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  USER_RESOURCE,
  WATCH_LIST_RESOURCE,
} from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';

/** The list an entry belongs to: chosen on create (or set by the list's tab), never moved. */
const watchListKey = f.relation({
  to: WATCH_LIST_RESOURCE,
  required: true,
  write: 'create',
  open: 'page',
  providerOptions: { relationship: 'watch_list' },
  texts: { label: 'Watch list', doc: { summary: 'The list the person or face is on; an entry is never moved to another list.' } },
});

const PROFILE_SUBJECT = {
  to: PROFILE_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'profile' },
  texts: {
    label: 'Person',
    doc: {
      summary:
        'The known person on the list: every identity linked to the profile counts, now and later. At most once per list.',
    },
  },
} as const;

const IDENTITY_SUBJECT = {
  to: IDENTITY_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'identity' },
  texts: {
    label: 'Identity',
    doc: {
      summary: 'One tracked face on the list, for someone without a profile (an unknown person). At most once per list.',
    },
  },
} as const;

/*
 * Who is on the list: one person (profile) or one face (identity), never both
 * (`watch_list_entries_exactly_one_subject`). Chosen on create by the subject's own resource; read
 * only (and either one empty) on the entries list.
 */
const profileChosen = f.relation({ ...PROFILE_SUBJECT, required: true, write: 'create' });
const identityChosen = f.relation({ ...IDENTITY_SUBJECT, required: true, write: 'create' });
const profileShown = f.relation({ ...PROFILE_SUBJECT, nullable: true, write: 'never' });
const identityShown = f.relation({ ...IDENTITY_SUBJECT, nullable: true, write: 'never' });

/** What every entry carries beside its subject. */
const entryDetails = {
  reason: f.text({
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why the person is on the list; shown to the operator with the event.' } },
  }),
  expires_at: dateTime({
    texts: {
      label: 'Expires',
      doc: {
        summary: 'When the entry stops counting; empty for never. An expired entry stays on the list as history until deleted.',
      },
    },
  }),
  active: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Active', doc: { summary: 'Whether the entry counts now: it has no expiry or its expiry is still ahead.' } },
  }),
  added_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'Added by', doc: { summary: 'The member who put the person on the list.' } },
  }),
  created_at: dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Added', doc: { summary: 'When the entry was added.' } } }),
};

const id = f.uuid({ system: true, texts: 'ID', in: [] });

/** Every column of `itap.watch_list_entries` the `org_admin` role reads: the entries list, either subject. */
export const watchListEntryFields = {
  id,
  watch_list_id: watchListKey,
  profile_id: profileShown,
  identity_id: identityShown,
  ...entryDetails,
};

/** An entry for a person: the profile create path (the form offers no identity). */
export const watchListProfileEntryFields = { id, watch_list_id: watchListKey, profile_id: profileChosen, ...entryDetails };

/** An entry for a face: the identity create path (the form offers no profile). */
export const watchListIdentityEntryFields = { id, watch_list_id: watchListKey, identity_id: identityChosen, ...entryDetails };

/** The columns of a list's People tab and of a profile's Watch lists tab. */
export const PROFILE_ENTRY_COLUMNS = ['profile_id', 'reason', 'expires_at', 'active', 'added_by'] as const;
export const IDENTITY_ENTRY_COLUMNS = ['identity_id', 'reason', 'expires_at', 'active', 'added_by'] as const;
/** The columns of a person's or a face's Watch lists tab. */
export const SUBJECT_ENTRY_COLUMNS = ['watch_list_id', 'reason', 'expires_at', 'active', 'added_by'] as const;
