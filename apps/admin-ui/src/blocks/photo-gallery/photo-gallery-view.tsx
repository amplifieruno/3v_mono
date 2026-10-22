import type { BlockViewProps } from '@burojs/react';
import { Badge, EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { IDENTITY_PHOTO_KIND_ENUM } from '../../enums/identities';
import { PhotoThumb } from '../../fields/photo-thumb';
import { type GalleryPhoto, galleryPhotos } from './identity-photos-query';
import type { photoGalleryBlock } from './photo-gallery-block';

type GalleryT = BlockViewProps<typeof photoGalleryBlock>['t'];

const when = (value: string): string => new Date(value).toLocaleString();

/** One photo's card: the crop, its kind, the quality score and where it came from. */
function PhotoCard({ photo, index, primary, t }: {
  readonly photo: GalleryPhoto;
  readonly index: number;
  readonly primary: boolean;
  readonly t: GalleryT;
}): React.ReactElement {
  return (
    <li data-testid="gallery-photo" className="flex w-36 flex-col gap-1 text-xs">
      <PhotoThumb fileId={photo.file_id} alt={t('photo', { params: { kind: photo.kind, index } })} className="size-36" />
      <div className="flex flex-wrap items-center gap-1">
        <EnumBadge enumName={IDENTITY_PHOTO_KIND_ENUM} value={photo.kind} />
        {primary ? <Badge variant="outline">{t('primary')}</Badge> : null}
      </div>
      <span>
        {photo.quality_score === null
          ? t('noQuality')
          : t('quality', { params: { value: photo.quality_score.toFixed(2) } })}
      </span>
      <span className="text-muted-foreground">
        {photo.captured_at === null
          ? t('added', { params: { time: when(photo.created_at) } })
          : t('taken', { params: { time: when(photo.captured_at) } })}
        {photo.device === null ? '' : ` ${t('camera', { params: { name: photo.device.name } })}`}
      </span>
    </li>
  );
}

/** The identity's photos (`itap:photo-gallery`), newest first, with the primary one marked. */
export function PhotoGalleryView({ props, data, t }: BlockViewProps<typeof photoGalleryBlock>): React.ReactElement {
  const parsed = galleryPhotos.safeParse((data as { readonly photos?: unknown }).photos);
  const photos = parsed.success ? parsed.data.photos : [];
  const total = parsed.success ? parsed.data.total : 0;
  if (photos.length === 0) {
    return (
      <p data-testid="photo-gallery" className="text-sm text-muted-foreground">
        {t('none')}
      </p>
    );
  }
  return (
    <section data-testid="photo-gallery" aria-label={t('label')} className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-4">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            index={index + 1}
            primary={photo.file_id === props.primaryFileId}
            t={t}
          />
        ))}
      </ul>
      {total > photos.length ? (
        <p className="text-xs text-muted-foreground">{t('more', { params: { shown: photos.length, total } })}</p>
      ) : null}
    </section>
  );
}
