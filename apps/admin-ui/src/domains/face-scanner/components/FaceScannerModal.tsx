/**
 * FaceScannerModal Component
 *
 * Modal wrapper for face scanning with two-step flow:
 * 1. Instructions step
 * 2. Scanning step
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScanningInstructions } from './ScanningInstructions'
import { FaceScanner } from './FaceScanner'

export interface FaceScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (files: File[]) => void
  profileId?: string
  debug?: boolean
}

type ModalStep = 'instructions' | 'scanning'

/**
 * Face scanner modal component
 *
 * Provides a guided face scanning experience with instructions
 * and full-screen scanning interface.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false)
 *
 * <FaceScannerModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   onComplete={(files) => {
 *     // Handle uploaded files
 *     setOpen(false)
 *   }}
 *   profileId="uuid-here"
 * />
 * ```
 */
export function FaceScannerModal({
  open,
  onOpenChange,
  onComplete,
  profileId: _profileId,
  debug = false,
}: FaceScannerModalProps) {
  const [step, setStep] = useState<ModalStep>('instructions')
  const [error, setError] = useState<Error | null>(null)

  // Reset state when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setStep('instructions')
      setError(null)
    }
    onOpenChange(newOpen)
  }

  const handleStartScanning = () => {
    setStep('scanning')
    setError(null)
  }

  const handleScanComplete = (files: File[]) => {
    onComplete(files)
    // Don't close modal here - let parent component handle it
    // so they can show loading state during upload
  }

  const handleError = (err: Error) => {
    setError(err)
    console.error('Face scanning error:', err)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={
          step === 'scanning' ? 'max-w-3xl h-[80vh] p-0' : 'max-w-lg'
        }
      >
        {step === 'instructions' ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Face ID</DialogTitle>
              <DialogDescription>
                We'll capture your face from multiple angles for better recognition
                accuracy.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <ScanningInstructions variant="info" />
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <p className="font-medium">Error:</p>
                <p>{error.message}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartScanning}>Start Scanning</Button>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col">
            <FaceScanner
              onFinish={handleScanComplete}
              onError={handleError}
              debug={debug}
            />

            {error && (
              <div className="flex-shrink-0 bg-destructive/10 text-destructive p-3 text-sm">
                <p className="font-medium">Error:</p>
                <p>{error.message}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setStep('instructions')}
                >
                  Go Back
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
