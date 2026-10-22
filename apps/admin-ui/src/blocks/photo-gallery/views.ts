import { implementBlock } from '@burojs/react';
import { photoGalleryBlock } from './photo-gallery-block';
import { PhotoGalleryView } from './photo-gallery-view';

/** The photo gallery's view, for `<BuroProvider blockImplementations>` (via the people views). */
export const photoGalleryView = implementBlock(photoGalleryBlock, { component: PhotoGalleryView });
