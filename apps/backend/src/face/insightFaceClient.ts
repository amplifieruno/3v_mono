import { z } from 'zod';

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

/** InsightFace-REST client (`POST /extract`, JSON payload with base64 image data). */
export function createInsightFaceClient(baseUrl: string, options: { timeoutMs?: number } = {}): InsightFaceClient {
  const url = `${baseUrl.replace(/\/+$/, '')}/extract`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS;

  return {
    async extract(image) {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        method: 'POST',
        // InsightFace-REST answers 500 when Accept is absent (it tests `'…msgpack' in accept`).
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          images: { data: [image.toString('base64')] },
          max_size: [640, 640],
          threshold: 0.6,
          extract_embedding: true,
          extract_ga: true,
        }),
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new InsightFaceError(`InsightFace /extract timed out after ${timeoutMs} ms`);
        }
        throw error;
      });
      const text = await res.text();
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
      const [first] = parsed.data.data;
      if (first.status !== 'ok') throw new InsightFaceError(`InsightFace could not process the image (${first.status})`);
      return first.faces.map(toFace);
    },
  };
}
