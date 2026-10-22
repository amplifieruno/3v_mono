import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { PhotoThumb } from './photo-thumb';
import { splitChoiceOf } from './split-photos-format';

/** The chosen photos as thumbnails, with how many face templates move with them (the review step). */
export function SplitPhotosDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const choice = splitChoiceOf(props.value);
  if (choice.photos.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2">
        {choice.photos.map((photo, index) => (
          <li key={photo.id}>
            <PhotoThumb
              fileId={photo.fileId}
              alt={t('console.splitPhotos.photo', { params: { index: index + 1 } })}
              className="size-16"
            />
          </li>
        ))}
      </ul>
      <span className="text-xs text-muted-foreground">
        {t('console.splitPhotos.moves', { params: { photos: choice.photos.length, templates: choice.embeddingIds.length } })}
      </span>
    </div>
  );
}
