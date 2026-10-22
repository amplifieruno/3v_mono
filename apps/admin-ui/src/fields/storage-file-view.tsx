import { type FieldPresentation, useCustomMutation, useT } from '@burojs/react';
import { Button, cn } from '@burojs/ui-shadcn';
import { ExternalLink, FileLock } from 'lucide-react';
import type * as React from 'react';
import { openFile } from './open-file';
import { usePresignedUrl } from './presigned-url';
import type { StorageFileMeta } from './storage-file-meta';

export interface StorageFileViewProps {
  readonly fileId: string;
  readonly meta: StorageFileMeta;
  readonly presentation: FieldPresentation;
}

const isImageField = (meta: StorageFileMeta): boolean => meta.accept?.trim().startsWith('image/') ?? false;

/** A sensitive file: one click asks `open_file` (audited) for a short-lived URL and opens it. */
function SensitiveFile({ fileId }: { readonly fileId: string }): React.ReactElement {
  const t = useT();
  const open = useCustomMutation(openFile);
  // `mutateAsync`, not a per-call `onSuccess`: that callback is dropped when the observer
  // re-subscribes (a data-session update) before the answer arrives. A failure shows from `isError`.
  const onClick = (): void => {
    open
      .mutateAsync({ file_id: fileId })
      .then(({ url }) => void window.open(url, '_blank', 'noopener,noreferrer'))
      .catch(() => undefined);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={open.isPending} onClick={onClick}>
        <FileLock className="size-4" aria-hidden />
        {t('console.storageFile.open')}
      </Button>
      {open.isError ? <span className="text-sm text-destructive">{t('console.storageFile.openFailed')}</span> : null}
    </span>
  );
}

/** A non-sensitive file through its storage presigned URL: an image preview or a link. */
function PresignedFile({ fileId, meta, presentation }: StorageFileViewProps): React.ReactElement {
  const t = useT();
  const presigned = usePresignedUrl(fileId);
  if (presigned.isError) return <span className="text-sm text-destructive">{t('console.storageFile.openFailed')}</span>;
  const url = presigned.data?.url;
  if (isImageField(meta)) {
    const plain = presentation === 'plain';
    return url ? (
      <img
        src={url}
        alt={t('console.storageFile.preview')}
        data-testid="storage-file-preview"
        className={cn('object-contain', plain ? 'h-6 w-auto' : 'h-16 w-auto max-w-48 rounded-md border bg-muted/20 p-1')}
      />
    ) : (
      <span className={cn('inline-block animate-pulse bg-muted', plain ? 'h-6 w-6' : 'h-16 w-16 rounded-md')} />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={url === undefined}
      className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
    >
      <ExternalLink className="size-4" aria-hidden />
      {t('console.storageFile.open')}
    </a>
  );
}

/** What a stored file looks like on a display or above its input. */
export function StorageFileView(props: StorageFileViewProps): React.ReactElement {
  return props.meta.sensitive ? <SensitiveFile fileId={props.fileId} /> : <PresignedFile {...props} />;
}
