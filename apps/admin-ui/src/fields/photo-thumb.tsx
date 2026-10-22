import { useT } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import { ImageOff } from 'lucide-react';
import type * as React from 'react';
import { usePresignedUrl } from './presigned-url';

export interface PhotoThumbProps {
  /** A non-sensitive image file of the organization. */
  readonly fileId: string;
  /** The image's text alternative. */
  readonly alt: string;
  readonly className?: string;
}

/**
 * A square thumbnail of a stored image through its presigned URL (face photos, crops): a
 * placeholder while the link loads, a crossed-out picture when the file cannot be read.
 */
export function PhotoThumb({ fileId, alt, className }: PhotoThumbProps): React.ReactElement {
  const t = useT();
  const presigned = usePresignedUrl(fileId);
  const box = cn('size-24 shrink-0 rounded-md border bg-muted/30', className);
  if (presigned.isError) {
    return (
      <span className={cn(box, 'flex items-center justify-center text-muted-foreground')} title={t('console.storageFile.openFailed')}>
        <ImageOff className="size-5" aria-label={t('console.storageFile.openFailed')} />
      </span>
    );
  }
  const url = presigned.data?.url;
  return url ? (
    <img src={url} alt={alt} className={cn(box, 'object-cover')} />
  ) : (
    <span className={cn(box, 'inline-block animate-pulse')} aria-hidden />
  );
}
