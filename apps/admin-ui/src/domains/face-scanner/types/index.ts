/**
 * Face Scanner Domain Types
 *
 * Type definitions for face scanning functionality including
 * face detection, position tracking, and scanning workflow.
 */

/**
 * Face bounding box coordinates
 */
export type FaceBox = {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

/**
 * Box inset values [top, right, bottom, left]
 */
export type BoxInset = [top: number, right: number, bottom: number, left: number]

/**
 * Head rotation position constraints
 * Defines yaw (left/right) and pitch (up/down) angle ranges
 */
export type Position = {
  yawMin?: number
  yawMax?: number
  pitchMin?: number
  pitchMax?: number
}

/**
 * Scanning workflow status
 */
export type ScanStatus =
  | 'idle'
  | 'starting'
  | 'loading'
  | 'initializing'
  | 'searchFace'
  | 'startingFace'
  | 'holdingFace'
  | 'trackFacePositions'
  | 'finished'
  | 'failed'
  | 'paused'
  | 'reseted'

/**
 * Face scanning positions (5 angles)
 */
export type ScanPosition = 'center' | 'top' | 'right' | 'bottom' | 'left'

/**
 * Individual scan result for one position
 */
export interface ScanResult {
  position: ScanPosition
  file: File
  timestamp: number
}

/**
 * Face scanner configuration options
 */
export interface FaceScannerConfig {
  /** Minimum face height as percentage of frame (0-1) */
  minFaceHeight: number
  /** Start position bounding box insets [top, right, bottom, left] */
  startFaceBox: BoxInset
  /** Exit tolerance bounding box insets */
  exitFaceBox: BoxInset
  /** Position angle constraints for each scan position */
  positions: Record<ScanPosition, Position>
  /** Starting position (usually 'center') */
  startPosition: ScanPosition
  /** Delay in ms before starting capture after face detected */
  startDelayMs: number
  /** Enable debug overlays */
  debug?: boolean
}

/**
 * Status messages for UI display
 */
export const StatusMessages: Record<ScanStatus, string> = {
  idle: 'Ready to start',
  starting: 'Starting camera',
  loading: 'Loading',
  initializing: 'Initializing face detection',
  failed: 'Camera failed',
  paused: 'Paused',
  reseted: 'Put your face in the circle',
  searchFace: 'Put your face in the circle',
  startingFace: 'Position your face',
  holdingFace: 'Hold still and look at camera',
  trackFacePositions: 'Rotate your head',
  finished: 'Success!',
}

/**
 * Position indicator state
 */
export type PositionIndicatorState = 'none' | 'empty' | 'full'

/**
 * Face detection result from Human library
 */
export interface FaceDetectionResult {
  confidence: number
  box: FaceBox
  rotation?: {
    angle: {
      yaw: number
      pitch: number
      roll: number
    }
  }
  mesh?: number[][]
}

/**
 * Screenshot data
 */
export interface Screenshot {
  dataUrl: string
  position: ScanPosition
  timestamp: number
}
