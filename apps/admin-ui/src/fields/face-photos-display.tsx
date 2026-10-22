import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { facePhotoIds } from './face-photos-format';
import type { FacePhotosMeta } from './face-photos-meta';
import { PhotoThumb } from './photo-thumb';

/** The chosen face photos as numbered thumbnails (a flow's review step). */
export function FacePhotosDisplay(props: ScalarDisplayProps<unknown, FacePhotosMeta>): React.ReactElement {
  const t = useT();
  const ids = facePhotoIds(props.value);
  if (ids.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-2">
      {ids.map((id, index) => (
        <li key={id}>
          <PhotoThumb fileId={id} alt={t('console.facePhotos.photo', { params: { index: index + 1 } })} className="size-16" />
        </li>
      ))}
    </ul>
  );
}
