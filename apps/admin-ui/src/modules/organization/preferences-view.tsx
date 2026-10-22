import { useIdentity, useList } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { ItapIdentity } from '../../auth';
import { USER_SETTINGS_RESOURCE } from './user-settings';

/**
 * The signed-in user's preferences, always as a form. Hasura answers only the
 * user's own row, so the list holds it or nothing: with a row the form updates it,
 * without one the first Save creates it (Hasura sets `user_id`), after which the
 * list refreshes and the form becomes the edit of the new row.
 */
export function PreferencesView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const rows = useList(USER_SETTINGS_RESOURCE, { scope: 'none' });
  const userId = identity?.id;
  if (!userId || !rows.isSuccess) return null;
  const own = (rows.data.data as readonly { user_id?: unknown }[]).find(
    (row) => row.user_id === userId,
  );
  return own === undefined ? (
    <RecordScreen key={`${userId}:create`} resource={USER_SETTINGS_RESOURCE} mode="create" />
  ) : (
    <RecordScreen
      key={`${userId}:edit`}
      resource={USER_SETTINGS_RESOURCE}
      mode="edit"
      recordId={userId}
    />
  );
}
