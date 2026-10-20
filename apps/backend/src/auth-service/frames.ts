import { ServiceError } from './errors.js';
import { sha256 } from './crypto.js';

export const MIN_FRAMES = 3;
export const MAX_FRAMES = 5;
/** Decoded size limit of a whole sequence. */
export const MAX_SEQUENCE_BYTES = 5 * 1024 * 1024;

export type Sequence = {
  frames: Buffer[];
  /** sha256 over the concatenated frame bytes (in order): the replay key and the input of the session binding. */
  digest: Buffer;
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isImage(data: Buffer): boolean {
  const jpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return jpeg || png;
}

/** Decodes and validates a submitted sequence (3–5 base64 JPEG / PNG frames, ≤ 5 MB decoded in total). */
export function decodeSequence(encoded: string[]): Sequence {
  if (encoded.length < MIN_FRAMES || encoded.length > MAX_FRAMES) {
    throw new ServiceError(400, 'invalid_sequence', `A sequence has ${MIN_FRAMES} to ${MAX_FRAMES} frames`, false,
      'Capture a short burst of 3 to 5 images from the live camera.');
  }
  const frames = encoded.map((text, index) => {
    const clean = text.replace(/^data:image\/[a-z]+;base64,/, '');
    if (!BASE64.test(clean)) throw new ServiceError(400, 'invalid_sequence', `frames[${index}] is not base64`);
    const data = Buffer.from(clean, 'base64');
    if (!isImage(data)) throw new ServiceError(400, 'invalid_sequence', `frames[${index}] is not a JPEG or PNG image`);
    return data;
  });
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  if (total > MAX_SEQUENCE_BYTES) {
    throw new ServiceError(413, 'sequence_too_large', 'The sequence exceeds 5 MB', false,
      'Send smaller frames (e.g. 640 px JPEG at quality 85).');
  }
  return fromFrames(frames);
}

export function fromFrames(frames: Buffer[]): Sequence {
  return { frames, digest: sha256(Buffer.concat(frames)) };
}

/** True when two frames of the sequence are byte-identical (a camera never produces the same JPEG twice). */
export function hasDuplicateFrames(frames: Buffer[]): boolean {
  const seen = new Set<string>();
  for (const frame of frames) {
    const key = sha256(frame).toString('hex');
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
