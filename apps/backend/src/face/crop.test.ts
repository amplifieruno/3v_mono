import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cropFace } from './crop.js';

/** 200x100 image: left half red, right half blue. */
async function twoTone(): Promise<Buffer> {
  const left = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer();
  return sharp({ create: { width: 200, height: 100, channels: 3, background: '#0000ff' } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

describe('cropFace', () => {
  it('should return a JPEG of the requested square size', async () => {
    const crop = await cropFace(await twoTone(), [20, 20, 60, 70], 150);
    const meta = await sharp(crop).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it('should default to 150 px', async () => {
    const meta = await sharp(await cropFace(await twoTone(), [20, 20, 60, 70])).metadata();
    expect([meta.width, meta.height]).toEqual([150, 150]);
  });

  it('should crop the face region (with margin) rather than the whole image', async () => {
    // A face box inside the red half: the crop must be red, not blue.
    const crop = await cropFace(await twoTone(), [30, 30, 60, 60], 50);
    const { data } = await sharp(crop).raw().toBuffer({ resolveWithObject: true });
    const [r, , b] = [data[0], data[1], data[2]];
    expect(r).toBeGreaterThan(200);
    expect(b).toBeLessThan(60);
  });

  it('should clamp a box that extends past the image border', async () => {
    const crop = await cropFace(await twoTone(), [-30, -10, 230, 120], 64);
    const meta = await sharp(crop).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);
  });
});
