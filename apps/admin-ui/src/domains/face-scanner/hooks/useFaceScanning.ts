/**
 * useFaceScanning Hook
 *
 * Main orchestration hook for face scanning workflow.
 * Manages FaceRecognitionService lifecycle and state.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { FaceRecognitionService } from '../services/FaceRecognitionService'
import type { ScanStatus, ScanPosition } from '../types'

export interface UseFaceScanningOptions {
  debug?: boolean
  onFinish?: (screenshots: Record<string, string>) => void
  onError?: (error: Error) => void
}

export interface UseFaceScanningReturn {
  status: ScanStatus | null
  positions: ScanPosition[]
  screenshots: Record<string, string>
  isScanning: boolean
  isComplete: boolean
  start: (container: HTMLElement) => void
  reset: () => void
  destroy: () => void
}

/**
 * Hook to manage face scanning workflow
 *
 * @param options - Scanning configuration and callbacks
 * @returns Scanning state and control functions
 *
 * @example
 * ```tsx
 * const { status, positions, start, destroy } = useFaceScanning({
 *   debug: false,
 *   onFinish: (screenshots) => {
 *     console.log('Captured screenshots:', screenshots)
 *   }
 * })
 *
 * const containerRef = useCallback((element: HTMLDivElement | null) => {
 *   if (element) {
 *     start(element)
 *   }
 * }, [start])
 *
 * useEffect(() => {
 *   return () => destroy()
 * }, [])
 * ```
 */
export function useFaceScanning(
  options: UseFaceScanningOptions = {}
): UseFaceScanningReturn {
  const { debug = false, onFinish, onError } = options

  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [positions, setPositions] = useState<ScanPosition[]>([])
  const [screenshots, setScreenshots] = useState<Record<string, string>>({})
  const [isComplete, setIsComplete] = useState(false)

  const serviceRef = useRef<FaceRecognitionService | null>(null)

  const start = useCallback(
    (container: HTMLElement) => {
      // Don't reinitialize if already exists
      if (serviceRef.current) {
        return
      }

      try {
        const service = new FaceRecognitionService({
          container,
          debug,
        })

        // Listen to status changes
        service.on('status', (newStatus: ScanStatus) => {
          setStatus(newStatus)

          if (newStatus === 'reseted') {
            setPositions([])
            setScreenshots({})
            setIsComplete(false)
          }

          if (newStatus === 'failed' && onError) {
            onError(new Error('Face scanning failed'))
          }
        })

        // Listen to position captures
        service.on('position', ({ position, image }: { position: string; image: string }) => {
          setPositions((prev) => [...prev, position as ScanPosition])
          setScreenshots((prev) => ({ ...prev, [position]: image }))
        })

        // Listen to completion
        service.on('finish', (capturedScreenshots: Record<string, string>) => {
          setIsComplete(true)
          setScreenshots(capturedScreenshots)
          if (onFinish) {
            onFinish(capturedScreenshots)
          }
        })

        serviceRef.current = service

        // Start scanning
        service.start().catch((err) => {
          console.error('Failed to start face scanning:', err)
          setStatus('failed')
          if (onError) {
            onError(err instanceof Error ? err : new Error('Failed to start scanning'))
          }
        })
      } catch (err) {
        console.error('Failed to initialize face scanning service:', err)
        setStatus('failed')
        if (onError) {
          onError(
            err instanceof Error ? err : new Error('Failed to initialize scanning')
          )
        }
      }
    },
    [debug, onFinish, onError]
  )

  const reset = useCallback(() => {
    if (serviceRef.current) {
      // Reset will trigger 'reseted' status event
      // which will clear positions and screenshots
      setPositions([])
      setScreenshots({})
      setIsComplete(false)
      setStatus('reseted')
    }
  }, [])

  const destroy = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.destroy()
      serviceRef.current = null
      setStatus(null)
      setPositions([])
      setScreenshots({})
      setIsComplete(false)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy()
      }
    }
  }, [])

  const isScanning = status !== null && status !== 'finished' && status !== 'failed'

  return {
    status,
    positions,
    screenshots,
    isScanning,
    isComplete,
    start,
    reset,
    destroy,
  }
}
