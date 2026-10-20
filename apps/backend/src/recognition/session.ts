import type { DetectionMessage, FrameResult, RecognitionDevice, SessionStats } from './types.js';

export type SessionDeps = {
  /** Current JPEG frame of a stream (stream-server snapshot). */
  fetchSnapshot(streamId: string): Promise<Buffer>;
  /** Recognizes the faces of one frame and writes its detections (see frame.ts); `signal` aborts on stop(). */
  processFrame(frame: Buffer, capturedAt: Date, signal: AbortSignal): Promise<FrameResult>;
  /** Live push of a committed detection (Socket.io). */
  onDetection(message: DetectionMessage): void;
  log(message: string): void;
};

export type RecognitionSession = {
  start(): void;
  stop(): void;
  stats(): SessionStats;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * One camera's recognition loop: every 1000/fps ms a snapshot is fetched and processed. Per-device backpressure:
 * a tick that finds the previous frame still processing is dropped (counted in framesDropped), so a slow
 * InsightFace never queues frames; devices do not wait for each other. Errors are recorded (lastError, logged once
 * per distinct message) and the loop continues. stop() also aborts a frame in flight before its next write.
 */
export function createRecognitionSession(device: RecognitionDevice, deps: SessionDeps): RecognitionSession {
  let timer: NodeJS.Timeout | undefined;
  let busy = false;
  // Aborted by stop(): a frame in flight writes nothing more once it notices.
  let controller = new AbortController();
  const counters: Omit<SessionStats, 'running' | 'fps'> = {
    framesProcessed: 0,
    framesDropped: 0,
    facesDetected: 0,
    facesSuppressed: 0,
    detections: 0,
    lastFrameAt: null,
    lastError: null,
  };

  async function runFrame(): Promise<void> {
    try {
      const { signal } = controller;
      const capturedAt = new Date();
      const frame = await deps.fetchSnapshot(device.streamId);
      if (signal.aborted) return;
      const result = await deps.processFrame(frame, capturedAt, signal);
      counters.framesProcessed += 1;
      counters.facesDetected += result.faces;
      counters.facesSuppressed += result.suppressed;
      counters.detections += result.detections.length;
      counters.lastFrameAt = capturedAt.toISOString();
      counters.lastError = null;
      for (const message of result.detections) {
        try {
          deps.onDetection(message);
        } catch (error: unknown) {
          deps.log(`recognition ${device.id}: push failed: ${errorMessage(error)}`);
        }
      }
    } catch (error: unknown) {
      const message = errorMessage(error);
      if (message !== counters.lastError) deps.log(`recognition ${device.id}: ${message}`);
      counters.lastError = message;
    }
  }

  function tick(): void {
    if (busy) {
      counters.framesDropped += 1;
      return;
    }
    busy = true;
    void runFrame().finally(() => {
      busy = false;
    });
  }

  return {
    start() {
      if (timer) return;
      controller = new AbortController();
      timer = setInterval(tick, Math.round(1000 / device.fps));
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      controller.abort();
    },
    stats() {
      return { running: timer !== undefined, fps: device.fps, ...counters };
    },
  };
}
