// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWebcam, webcamFailure } from '../../src/components/webcam-capture/use-webcam';

/**
 * The browser camera without a camera: which status each refusal of `getUserMedia` means, and
 * that every track stops when the component goes away (also when the permission answer comes
 * after it left), so the camera light never stays on behind a closed dialog.
 */

/** A stream of one video track whose `stop` is a spy. */
function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

/** Installs `navigator.mediaDevices.getUserMedia` answering with `answer`. */
function withCamera(answer: () => Promise<MediaStream>): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(answer);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  return getUserMedia;
}

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

describe('webcamFailure', () => {
  it('should map each DOMException name the browsers give to a status', () => {
    const cases: readonly [string, string][] = [
      ['NotAllowedError', 'denied'],
      ['SecurityError', 'denied'],
      ['NotFoundError', 'missing'],
      ['OverconstrainedError', 'missing'],
      ['DevicesNotFoundError', 'missing'],
      ['NotReadableError', 'busy'],
      ['TrackStartError', 'busy'],
      ['AbortError', 'busy'],
      ['TypeError', 'failed'],
    ];
    for (const [name, status] of cases) {
      expect(webcamFailure(new DOMException('refused', name)), name).toBe(status);
    }
    const plain = new Error('x');
    plain.name = 'NotAllowedError';
    expect(webcamFailure(plain)).toBe('denied');
    expect(webcamFailure('not an error')).toBe('failed');
  });
});

describe('useWebcam', () => {
  it('should say unsupported when the browser offers no camera access', async () => {
    const { result } = renderHook(() => useWebcam());
    await act(() => result.current.start());
    expect(result.current.status).toBe('unsupported');
  });

  it('should go live, stop every track on stop and again on unmount', async () => {
    const first = fakeStream();
    withCamera(async () => first.stream);
    const { result, unmount } = renderHook(() => useWebcam());
    await act(() => result.current.start());
    expect(result.current.status).toBe('live');
    act(() => result.current.stop());
    expect(result.current.status).toBe('off');
    expect(first.track.stop).toHaveBeenCalledTimes(1);

    const second = fakeStream();
    withCamera(async () => second.stream);
    await act(() => result.current.start());
    unmount();
    expect(second.track.stop).toHaveBeenCalledTimes(1);
  });

  it('should stop a stream granted after the component left', async () => {
    const late = fakeStream();
    let grant: (stream: MediaStream) => void = () => undefined;
    withCamera(() => new Promise<MediaStream>((resolve) => (grant = resolve)));
    const { result, unmount } = renderHook(() => useWebcam());
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    expect(result.current.status).toBe('starting');
    unmount();
    grant(late.stream);
    await started;
    expect(late.track.stop).toHaveBeenCalledTimes(1);
  });

  it('should report a refused permission as denied', async () => {
    withCamera(async () => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const { result } = renderHook(() => useWebcam());
    await act(() => result.current.start());
    expect(result.current.status).toBe('denied');
  });
});
