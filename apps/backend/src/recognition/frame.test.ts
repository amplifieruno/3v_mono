import { beforeAll, describe, expect, it } from 'vitest';
import { AT, DEVICE, face, KNOWN_A, KNOWN_B, makeFrame, NEW_ID, stubs } from '../../tests/unit/frameStubs.js';
import { processFrame } from './frame.js';

let frame: Buffer;
beforeAll(async () => {
  frame = await makeFrame();
});

describe('processFrame', () => {
  it('should create a camera identity for an unknown face and insert a detection with its thumbnail', async () => {
    const { deps, ops } = stubs([face(1)]);
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ quality: expect.any(Number) }),
      { deviceId: DEVICE.id, capturedAt: AT },
    );
    const [insert] = ops('RecognitionInsertDetection');
    expect(insert.vars.object).toEqual({
      organization_id: DEVICE.organizationId,
      device_id: DEVICE.id,
      identity_id: NEW_ID,
      confidence: 0.95,
      similarity: null,
      is_new_identity: true,
      bbox: { x: 100, y: 100, width: 120, height: 140 },
      frame_width: 640,
      frame_height: 480,
      quality_score: expect.any(Number),
      thumbnail_file_id: 'new-crop',
      detected_at: AT.toISOString(),
    });
    expect(result.faces).toBe(1);
    expect(result.detections).toEqual([
      {
        detectionId: 'det-1',
        deviceId: DEVICE.id,
        identityId: NEW_ID,
        identityCode: 'IDENTITY-00042',
        profileId: null,
        profileName: null,
        isNewIdentity: true,
        confidence: 0.95,
        bbox: { x: 100, y: 100, width: 120, height: 140 },
        frameWidth: 640,
        frameHeight: 480,
        detectedAt: AT.toISOString(),
      },
    ]);
  });

  it('should insert a detection of a known identity without creating an identity or a thumbnail', async () => {
    const { deps, ops } = stubs([face(1)], { matches: { 1: KNOWN_A } });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).not.toHaveBeenCalled();
    const [insert] = ops('RecognitionInsertDetection');
    expect(insert.vars.object).toMatchObject({
      identity_id: KNOWN_A,
      similarity: 0.8,
      is_new_identity: false,
      thumbnail_file_id: null,
    });
    expect(result.detections[0]).toMatchObject({ identityCode: 'CODE-a', profileId: 'p-a', profileName: 'Ann Lee' });
    // Matching runs with the organization's own threshold (match_face default) and one result.
    expect(ops('RecognitionMatch')[0].vars).toEqual({ embedding: expect.stringMatching(/^\[1,0,/) });
  });

  it('should add a template only when the face beats the worst of the top five', async () => {
    const better = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: 0.1 } } });
    await processFrame(better.deps, DEVICE, frame, AT);
    const [consider] = better.ops('RecognitionConsiderTemplate');
    expect(consider.vars.args).toMatchObject({
      p_organization_id: DEVICE.organizationId,
      p_identity_id: KNOWN_A,
      p_photo_file_id: 'crop-file',
      p_device_id: DEVICE.id,
      p_source_detection_id: 'det-1',
      p_model_version: 'test-model',
      p_captured_at: AT.toISOString(),
    });
    expect(better.storage.upload).toHaveBeenCalledTimes(1);

    const worse = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: 0.99 } } });
    await processFrame(worse.deps, DEVICE, frame, AT);
    expect(worse.ops('RecognitionConsiderTemplate')).toHaveLength(0);
    expect(worse.storage.upload).not.toHaveBeenCalled();
  });

  it('should add a template while the identity has fewer than five', async () => {
    const { deps, ops } = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 2, worst: 0.99 } } });
    await processFrame(deps, DEVICE, frame, AT);
    expect(ops('RecognitionConsiderTemplate')).toHaveLength(1);
  });

  it('should delete the uploaded crop when SQL refuses the template', async () => {
    const { deps, storage } = stubs([face(1)], {
      matches: { 1: KNOWN_A },
      templates: { [KNOWN_A]: { count: 5, worst: 0.1 } },
      admitTemplate: false,
    });
    await processFrame(deps, DEVICE, frame, AT);
    expect(storage.deleteFile).toHaveBeenCalledWith('crop-file');
  });

  it('should keep the detection and log when the template update fails', async () => {
    const { deps, storage } = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 1, worst: 0.9 } } });
    storage.upload.mockRejectedValueOnce(new Error('storage down'));
    const result = await processFrame(deps, DEVICE, frame, AT);
    expect(result.detections).toHaveLength(1);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('storage down'));
  });

  it('should insert detections one per statement sorted by identity id, unidentified faces last', async () => {
    const lowQuality = face(9, 0.55, [10, 10, 20, 20]); // tiny, barely detected: no identity is created
    const { deps, ops } = stubs([face(1, 0.9), lowQuality, face(2, 0.8)], { matches: { 1: KNOWN_B, 2: KNOWN_A } });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).not.toHaveBeenCalled();
    expect(ops('RecognitionInsertDetection').map((c) => (c.vars.object as { identity_id: string | null }).identity_id)).toEqual([
      KNOWN_A,
      KNOWN_B,
      null,
    ]);
    expect(result.faces).toBe(3);
  });

  it('should process at most five faces per frame (highest detector score first)', async () => {
    const faces = [0.6, 0.9, 0.7, 0.95, 0.8, 0.65, 0.85].map((score, i) => face(i + 1, score));
    const matches = Object.fromEntries(faces.map((_, i) => [i + 1, KNOWN_A]));
    const { deps, ops } = stubs(faces, { matches });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(result.faces).toBe(7);
    const confidences = ops('RecognitionInsertDetection').map((c) => (c.vars.object as { confidence: number }).confidence);
    expect(confidences.sort()).toEqual([0.8, 0.85, 0.9, 0.95, 0.7].sort());
  });

  it('should insert nothing for a frame without faces', async () => {
    const { deps, ops } = stubs([]);
    const result = await processFrame(deps, DEVICE, frame, AT);
    expect(result).toEqual({ faces: 0, detections: [] });
    expect(ops('RecognitionInsertDetection')).toHaveLength(0);
  });
});
