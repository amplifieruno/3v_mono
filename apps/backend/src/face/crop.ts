import sharp from 'sharp';

/** Margin added on every side of the face box, as a share of its width/height. */
const MARGIN = 0.2;

/**
 * Square JPEG thumbnail of a face: the box plus a 20% margin, clamped to the image, resized to `size` (cover).
 * `bbox` is [x1, y1, x2, y2] in pixels of `image` as stored (callers pass an orientation-normalized image).
 */
export async function cropFace(image: Buffer, bbox: [number, number, number, number], size = 150): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const [x1, y1, x2, y2] = bbox;
  const marginX = (x2 - x1) * MARGIN;
  const marginY = (y2 - y1) * MARGIN;

  const left = Math.max(0, Math.floor(x1 - marginX));
  const top = Math.max(0, Math.floor(y1 - marginY));
  const right = Math.min(width, Math.ceil(x2 + marginX));
  const bottom = Math.min(height, Math.ceil(y2 + marginY));

  return sharp(image)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();
}
