/**
 * Human Library Utilities
 *
 * Initialize and configure @vladmandic/human library for face detection
 */

import Human from '@vladmandic/human';
import type { Config as HumanConfig } from '@vladmandic/human';
import type { FaceScannerConfig } from '../types';

/**
 * Create Human library configuration
 * Based on proven implementation with minimal enabled features
 */
export function createHumanConfig(config?: FaceScannerConfig): Partial<HumanConfig> {
  return {
    async: true,
    modelBasePath: config?.modelBasePath || '/models',

    // Image preprocessing
    filter: {
      enabled: true,
      equalization: false,
      flip: false,
    },

    // Face detection configuration
    face: {
      enabled: true,
      detector: {
        rotation: true, // CRITICAL: Enable yaw/pitch/roll detection
      },
      mesh: {
        enabled: true, // CRITICAL: Enable mesh for face bounds calculation
      },
      // Disable unused features for better performance
      attention: {
        enabled: false,
      },
      iris: {
        enabled: false,
      },
      description: {
        enabled: false,
      },
      emotion: {
        enabled: false,
      },
    },

    // Disable all other detection types
    body: {
      enabled: false,
    },
    hand: {
      enabled: false,
    },
    object: {
      enabled: false,
    },
    gesture: {
      enabled: false,
    },
  };
}

/**
 * Initialize Human library instance
 * Performs warmup to initialize TensorFlow backend
 */
export async function initializeHuman(config?: FaceScannerConfig): Promise<Human> {
  const humanConfig = createHumanConfig(config);
  const human = new Human(humanConfig);

  // Warmup: initialize TensorFlow backend for faster first detection
  await human.warmup();

  return human;
}
