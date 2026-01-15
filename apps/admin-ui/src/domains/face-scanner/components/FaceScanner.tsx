/**
 * FaceScanner Component
 *
 * Main face scanning component with camera preview and position tracking.
 * Uses FaceRecognitionService for multi-angle face capture.
 */

import { useCallback, useEffect } from 'react'
import { useFaceScanning } from '../hooks/useFaceScanning'
import { PositionIndicator } from './PositionIndicator'
import { StatusMessages } from '../types'
import { urlToFile } from '../utils/screenshotHelpers'
import type { ScanPosition } from '../types'

export interface FaceScannerProps {
  onFinish: (files: File[]) => void
  onError?: (error: Error) => void
  debug?: boolean
}

/**
 * Face scanner component
 *
 * Captures 5 face angles (center, top, right, bottom, left) and converts
 * them to File objects for upload.
 *
 * @example
 * ```tsx
 * <FaceScanner
 *   onFinish={(files) => {
 *     console.log('Captured files:', files)
 *     // Upload files to backend
 *   }}
 *   onError={(error) => {
 *     console.error('Scanning error:', error)
 *   }}
 * />
 * ```
 */
export function FaceScanner({ onFinish, onError, debug = false }: FaceScannerProps) {
  const { status, positions, screenshots, isComplete, start, destroy } = useFaceScanning({
    debug,
    onFinish: async (capturedScreenshots) => {
      try {
        // Convert screenshots to File objects
        const files: File[] = []
        const positionOrder: ScanPosition[] = ['center', 'top', 'right', 'bottom', 'left']

        for (const position of positionOrder) {
          if (capturedScreenshots[position]) {
            const file = await urlToFile(
              capturedScreenshots[position],
              `${position}.jpg`,
              'image/jpeg'
            )
            files.push(file)
          }
        }

        onFinish(files)
      } catch (error) {
        console.error('Failed to convert screenshots to files:', error)
        if (onError) {
          onError(
            error instanceof Error
              ? error
              : new Error('Failed to process screenshots')
          )
        }
      }
    },
    onError,
  })

  // Container ref callback to initialize scanning
  const containerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        start(element)
      }
    },
    [start]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroy()
    }
  }, [destroy])

  // Get user-friendly status message
  const statusMessage = status ? StatusMessages[status] : 'Initializing...'

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Status message */}
      <div className="flex-shrink-0 py-4 px-6 bg-background/95 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-lg font-medium">{statusMessage}</p>
          {status === 'trackFacePositions' && (
            <p className="text-sm text-muted-foreground mt-1">
              {positions.length} of 5 positions captured
            </p>
          )}
        </div>
      </div>

      {/* Camera/Scanner container */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{
            // Ensure container fills the space
            width: '100%',
            height: '100%',
          }}
        />

        {/* Position indicators overlay */}
        {status && status !== 'starting' && status !== 'loading' && (
          <PositionIndicator capturedPositions={positions} debug={debug} />
        )}
      </div>

      {/* Progress indicator */}
      {status === 'trackFacePositions' && (
        <div className="flex-shrink-0 p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex gap-2 justify-center">
            {['center', 'top', 'right', 'bottom', 'left'].map((pos) => (
              <div
                key={pos}
                className={`w-3 h-3 rounded-full transition-colors ${
                  positions.includes(pos as ScanPosition)
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
                title={pos}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completion message */}
      {isComplete && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="text-6xl mb-4">✓</div>
            <p className="text-2xl font-medium">Scan Complete!</p>
            <p className="text-sm text-white/70 mt-2">Processing images...</p>
          </div>
        </div>
      )}
    </div>
  )
}
