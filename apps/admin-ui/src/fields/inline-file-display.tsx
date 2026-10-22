import { type ScalarDisplayProps, formatBytes } from '@burojs/react';
import { FileText } from 'lucide-react';
import type * as React from 'react';
import { inlineFileValue } from './inline-file';
import type { InlineFileMeta } from './inline-file-meta';

/** A picked file by its name and size (a review step shows it); never its content. */
export function InlineFileDisplay(props: ScalarDisplayProps<unknown, InlineFileMeta>): React.ReactElement {
  const file = inlineFileValue.safeParse(props.value);
  if (!file.success) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={props.testIds.display}>
      <FileText className="size-4 text-muted-foreground" aria-hidden />
      {file.data.file_name}
      <span className="text-muted-foreground text-xs">{formatBytes(file.data.size)}</span>
    </span>
  );
}
