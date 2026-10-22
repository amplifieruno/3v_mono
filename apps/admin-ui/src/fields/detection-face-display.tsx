import { type ScalarDisplayProps, useT } from '@burojs/react';
import { Badge, cn } from '@burojs/ui-shadcn';
import { ImageOff } from 'lucide-react';
import type * as React from 'react';
import { detectionFaceState } from './detection-face-state';
import { usePresignedUrl } from './presigned-url';

/** The erased note: a crossed-out picture and the word, never an error. */
function Erased({ small }: { readonly small: boolean }): React.ReactElement {
  const t = useT();
  return (
    <span
      className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      title={t('console.detectionFace.erasedHint')}
      data-testid="detection-face-erased"
    >
      <ImageOff className={small ? 'size-4' : 'size-5'} aria-hidden />
      {t('console.detectionFace.erased')}
    </span>
  );
}

/** The face file through its presigned URL; a file that is gone reads as erased. */
function FacePhoto({
  fileId,
  isNew,
  small,
}: {
  readonly fileId: string;
  readonly isNew: boolean;
  readonly small: boolean;
}): React.ReactElement {
  const t = useT();
  const presigned = usePresignedUrl(fileId);
  if (presigned.isError) return <Erased small={small} />;
  const box = cn('shrink-0 rounded-md border bg-muted/30', small ? 'size-10' : 'size-24');
  const url = presigned.data?.url;
  return (
    <span className="inline-flex items-center gap-2">
      {url ? (
        <img src={url} alt={t('console.detectionFace.photo')} className={cn(box, 'object-cover')} />
      ) : (
        <span className={cn(box, 'inline-block animate-pulse')} aria-hidden />
      )}
      {isNew ? <Badge variant="info">{t('console.detectionFace.newIdentity')}</Badge> : null}
    </span>
  );
}

/** A detection's face (`itap.detection-face`): the photo, or what became of the person. */
export function DetectionFaceDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const small = props.presentation === 'plain';
  const state = detectionFaceState(props.value, props.record);
  switch (state.kind) {
    case 'photo':
      return <FacePhoto fileId={state.fileId} isNew={state.isNew} small={small} />;
    case 'erased':
      return <Erased small={small} />;
    case 'unidentified':
      return (
        <span className="text-sm text-muted-foreground" title={t('console.detectionFace.unidentifiedHint')}>
          {t('console.detectionFace.unidentified')}
        </span>
      );
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}
