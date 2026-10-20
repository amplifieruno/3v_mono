import { z } from 'zod';
import { mapAbort } from '../http/abort.js';

export const EMBEDDING_DIM = 512;

export type ExtractedFace = {
  /** [x1, y1, x2, y2] in pixels of the image that was sent. */
  bbox: [number, number, number, number];
  /** Detector confidence, 0..1. */
  score: number;
  /** L2-normalized ArcFace embedding (512 numbers). */
  embedding: number[];
  age?: number;
  gender?: 'male' | 'female';
};

export type InsightFaceClient = {
  /** Detects faces and extracts their embeddings. Not serialized here: callers send one image at a time. */
  extract(image: Buffer): Promise<ExtractedFace[]>;
};

export class InsightFaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsightFaceError';
  }
}

const faceSchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  prob: z.number(),
  vec: z.array(z.number()).length(EMBEDDING_DIM),
  age: z.number().nullish(),
  // insightface genderage: 1 = male, 0 = female; null when no gender/age model is loaded.
  gender: z.number().int().min(0).max(1).nullish(),
});

const responseSchema = z.object({
  data: z.array(z.object({ status: z.string(), faces: z.array(faceSchema).default([]) })).min(1),
});

function toFace(face: z.output<typeof faceSchema>): ExtractedFace {
  const [x1, y1, x2, y2] = face.bbox;
  const result: ExtractedFace = { bbox: [x1, y1, x2, y2], score: face.prob, embedding: face.vec };
  if (typeof face.age === 'number') result.age = Math.round(face.age);
  if (typeof face.gender === 'number') result.gender = face.gender === 1 ? 'male' : 'female';
  return result;
}

/** Default limit of one /extract call: CPU InsightFace is slow, but a hung call must not stall its caller. */
export const DEFAULT_EXTRACT_TIMEOUT_MS = 30_000;

export type InsightFaceBatchClient = InsightFaceClient & {
  /** One /extract call for several images (the auth service's frame sequence); results in input order. */
  extractMany(images: Buffer[]): Promise<ExtractedFace[][]>;
  /**
   * GET /info (models loaded; its /health self-checks an image the container does not ship); false when it does not
   * answer 2xx in time.
   */
  health(timeoutMs?: number): Promise<boolean>;
};

/** InsightFace-REST client (`POST /extract`, JSON payload with base64 image data). */
export function createInsightFaceClient(
  baseUrl: string,
  options: { timeoutMs?: number } = {},
): InsightFaceBatchClient {
  const root = baseUrl.replace(/\/+$/, '');
  const url = `${root}/extract`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS;

  async function extractAll(images: Buffer[]): Promise<ExtractedFace[][]> {
    const timedOut = () => new InsightFaceError(`InsightFace /extract timed out after ${timeoutMs} ms`);
    const request = fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      method: 'POST',
      // InsightFace-REST answers 500 when Accept is absent (it tests `'…msgpack' in accept`).
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        images: { data: images.map((image) => image.toString('base64')) },
        max_size: [640, 640],
        threshold: 0.6,
        extract_embedding: true,
        extract_ga: true,
      }),
    });
    const res = await mapAbort(request, timedOut);
    // The signal also covers the body read: a timeout there is the same InsightFaceError.
    const text = await mapAbort(res.text(), timedOut);
    if (!res.ok) throw new InsightFaceError(`InsightFace /extract failed (${res.status}): ${text.slice(0, 200)}`);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new InsightFaceError(`InsightFace /extract returned non-JSON: ${text.slice(0, 200)}`);
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new InsightFaceError(`Unexpected InsightFace response at ${issue.path.join('.')}: ${issue.message}`);
    }
    if (parsed.data.data.length !== images.length) {
      throw new InsightFaceError(`InsightFace returned ${parsed.data.data.length} results for ${images.length} images`);
    }
    return parsed.data.data.map((item) => {
      if (item.status !== 'ok') throw new InsightFaceError(`InsightFace could not process the image (${item.status})`);
      return item.faces.map(toFace);
    });
  }

  return {
    async extract(image) {
      const [faces] = await extractAll([image]);
      return faces;
    },
    extractMany: extractAll,
    async health(healthTimeoutMs = 2000) {
      try {
        const res = await fetch(`${root}/info`, { signal: AbortSignal.timeout(healthTimeoutMs) });
        await res.arrayBuffer();
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
