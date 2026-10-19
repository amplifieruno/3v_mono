import { describe, expect, it } from 'vitest';
import type { ExtractedFace } from '../face/insightFaceClient.js';
import { defaultThreshold, largestFace, resolveSearchOptions, SearchError } from './options.js';

const FILE = '22222222-2222-4222-8222-222222222222';

function face(bbox: [number, number, number, number]): ExtractedFace {
  return { bbox, score: 0.9, embedding: [] };
}

describe('defaultThreshold', () => {
  it('should turn the organization recognition distance into a similarity threshold', () => {
    expect(defaultThreshold(0.5)).toBeCloseTo(0.5);
    expect(defaultThreshold(0.4)).toBeCloseTo(0.6);
  });

  it('should clamp into 0.2..0.95 and default to 0.5 without a setting', () => {
    expect(defaultThreshold(0.95)).toBeCloseTo(0.2);
    expect(defaultThreshold(0)).toBeCloseTo(0.95);
    expect(defaultThreshold(null)).toBeCloseTo(0.5);
  });
});

describe('resolveSearchOptions', () => {
  it('should apply defaults for a facial search', () => {
    expect(resolveSearchOptions({ searchType: 'facial', imageFileId: FILE }, 0.4)).toEqual({
      searchType: 'facial',
      imageFileId: FILE,
      filters: {},
      threshold: expect.closeTo(0.6, 5),
      maxResults: 20,
      fuzzy: false,
    });
  });

  it('should keep explicit values within the limits', () => {
    const options = resolveSearchOptions(
      { searchType: 'combined', imageFileId: FILE, filters: { linked: true }, threshold: 0.7, maxResults: 100, fuzzy: true },
      0.5,
    );
    expect(options).toMatchObject({ threshold: 0.7, maxResults: 100, fuzzy: true, filters: { linked: true } });
  });

  it('should reject a threshold outside 0.2..0.95 and max_results outside 1..100', () => {
    for (const threshold of [0.19, 0.96]) {
      expect(() => resolveSearchOptions({ searchType: 'facial', imageFileId: FILE, threshold }, 0.5)).toThrow(SearchError);
    }
    for (const maxResults of [0, 101, 2.5]) {
      expect(() => resolveSearchOptions({ searchType: 'facial', imageFileId: FILE, maxResults }, 0.5)).toThrow(
        /max_results/,
      );
    }
  });

  it('should require an image for facial and combined searches and forbid one for attribute searches', () => {
    expect(() => resolveSearchOptions({ searchType: 'facial' }, 0.5)).toThrow(/image_file_id/);
    expect(() => resolveSearchOptions({ searchType: 'combined', filters: { linked: true } }, 0.5)).toThrow(/image_file_id/);
    expect(() => resolveSearchOptions({ searchType: 'attribute', imageFileId: FILE }, 0.5)).toThrow(/image_file_id/);
  });

  it('should drop threshold and fuzzy for an attribute search', () => {
    expect(resolveSearchOptions({ searchType: 'attribute', filters: { gender: 'female' }, fuzzy: true }, 0.5)).toEqual({
      searchType: 'attribute',
      imageFileId: null,
      filters: { gender: 'female' },
      threshold: null,
      maxResults: 20,
      fuzzy: false,
    });
  });

  it('should reject an unknown search type with invalid_input', () => {
    try {
      resolveSearchOptions({ searchType: 'voice' }, 0.5);
      expect.unreachable();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).code).toBe('invalid_input');
    }
  });
});

describe('largestFace', () => {
  it('should pick the face with the largest box', () => {
    const small = face([0, 0, 10, 10]);
    const big = face([20, 20, 80, 90]);
    expect(largestFace([small, big, face([0, 0, 30, 30])])).toBe(big);
    expect(largestFace([])).toBeUndefined();
  });
});
