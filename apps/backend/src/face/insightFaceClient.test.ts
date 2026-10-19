import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInsightFaceClient, InsightFaceError } from './insightFaceClient.js';

const vec = (value = 0.01) => Array.from({ length: 512 }, () => value);

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('createInsightFaceClient.extract', () => {
  it('should POST /extract with the base64 image and the fixed detection options', async () => {
    const fn = stubFetch({ data: [{ status: 'ok', faces: [] }] });
    await createInsightFaceClient('http://insightface:18080/').extract(Buffer.from('jpeg-bytes'));

    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://insightface:18080/extract');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    // InsightFace-REST fails with 500 when the Accept header is missing.
    expect(headers.accept).toBe('application/json');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      images: { data: [Buffer.from('jpeg-bytes').toString('base64')] },
      max_size: [640, 640],
      threshold: 0.6,
      extract_embedding: true,
      extract_ga: true,
    });
  });

  it('should map faces to bbox, score, embedding and optional age/gender', async () => {
    stubFetch({
      data: [
        {
          status: 'ok',
          faces: [
            { bbox: [10, 20, 110, 140], prob: 0.81, vec: vec(), age: 31, gender: 1, size: 100 },
            { bbox: [200, 20, 260, 90], prob: 0.7, vec: vec(0.02), age: null, gender: null },
            { bbox: [300, 20, 360, 90], prob: 0.65, vec: vec(0.03), age: 25.6, gender: 0 },
          ],
        },
      ],
    });
    const faces = await createInsightFaceClient('http://if').extract(Buffer.from('x'));
    expect(faces).toEqual([
      { bbox: [10, 20, 110, 140], score: 0.81, embedding: vec(), age: 31, gender: 'male' },
      { bbox: [200, 20, 260, 90], score: 0.7, embedding: vec(0.02) },
      { bbox: [300, 20, 360, 90], score: 0.65, embedding: vec(0.03), age: 26, gender: 'female' },
    ]);
  });

  it('should return an empty list when no face is found', async () => {
    stubFetch({ data: [{ status: 'ok', faces: [] }] });
    expect(await createInsightFaceClient('http://if').extract(Buffer.from('x'))).toEqual([]);
  });

  it('should reject an embedding that is not 512 numbers long', async () => {
    stubFetch({ data: [{ status: 'ok', faces: [{ bbox: [0, 0, 10, 10], prob: 0.9, vec: [0.1, 0.2] }] }] });
    await expect(createInsightFaceClient('http://if').extract(Buffer.from('x'))).rejects.toThrow(InsightFaceError);
  });

  it('should reject a face without an embedding', async () => {
    stubFetch({ data: [{ status: 'ok', faces: [{ bbox: [0, 0, 10, 10], prob: 0.9 }] }] });
    await expect(createInsightFaceClient('http://if').extract(Buffer.from('x'))).rejects.toThrow(InsightFaceError);
  });

  it('should raise InsightFaceError on an HTTP error', async () => {
    stubFetch('{"detail":"boom"}', 500);
    await expect(createInsightFaceClient('http://if').extract(Buffer.from('x'))).rejects.toThrow(/500/);
  });

  it('should raise InsightFaceError on an image-level error status', async () => {
    stubFetch({ data: [{ status: 'error', faces: [] }] });
    await expect(createInsightFaceClient('http://if').extract(Buffer.from('x'))).rejects.toThrow(InsightFaceError);
  });

  it('should raise InsightFaceError on an unexpected body', async () => {
    stubFetch({ unexpected: true });
    await expect(createInsightFaceClient('http://if').extract(Buffer.from('x'))).rejects.toThrow(InsightFaceError);
  });
});

describe('createInsightFaceClient timeout', () => {
  it('should fail with an InsightFaceError when /extract does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const client = createInsightFaceClient('http://insightface:18080', { timeoutMs: 20 });
    await expect(client.extract(Buffer.from('x'))).rejects.toThrow(/timed out after 20 ms/);
    await expect(client.extract(Buffer.from('x'))).rejects.toBeInstanceOf(InsightFaceError);
  });
});
