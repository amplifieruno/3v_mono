import type { RecognitionManager } from './manager.js';

/**
 * The process's recognition manager (set by index.ts when RECOGNITION_ENABLED), so the recognition actions,
 * served by the same process, can notify it and read live stats. Undefined when recognition is off.
 */
let current: RecognitionManager | undefined;

export function setRecognitionManager(manager: RecognitionManager | undefined): void {
  current = manager;
}

export function getRecognitionManager(): RecognitionManager | undefined {
  return current;
}
