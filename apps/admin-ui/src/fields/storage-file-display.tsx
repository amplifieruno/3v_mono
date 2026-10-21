import type { ScalarDisplayProps } from '@burojs/react';
import type * as React from 'react';
import type { StorageFileMeta } from './storage-file-meta';
import { StorageFileView } from './storage-file-view';

/** A stored file: a preview or a link; a sensitive file opens through `open_file`. */
export function StorageFileDisplay(
  props: ScalarDisplayProps<unknown, StorageFileMeta>,
): React.ReactElement {
  const value = typeof props.value === 'string' && props.value !== '' ? props.value : null;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <StorageFileView fileId={value} meta={props.meta} presentation={props.presentation} />;
}
