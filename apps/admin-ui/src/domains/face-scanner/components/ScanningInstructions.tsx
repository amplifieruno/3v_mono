/**
 * ScanningInstructions Component
 *
 * User-friendly instructions shown before/during face scanning.
 */

import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ScanningInstructionsProps {
  variant?: 'info' | 'scanning'
}

/**
 * Instructions component for face scanning
 *
 * @param variant - 'info' for initial instructions, 'scanning' for during scan
 */
export function ScanningInstructions({ variant = 'info' }: ScanningInstructionsProps) {
  if (variant === 'info') {
    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How to scan your face</AlertTitle>
          <AlertDescription>
            Follow these steps for best results:
          </AlertDescription>
        </Alert>

        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              1
            </div>
            <div>
              <p className="font-medium">Position your face in the center</p>
              <p className="text-muted-foreground">
                Make sure your entire face is visible in the frame
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              2
            </div>
            <div>
              <p className="font-medium">Hold still and look at the camera</p>
              <p className="text-muted-foreground">
                Keep your face steady for a moment while we capture the center position
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              3
            </div>
            <div>
              <p className="font-medium">Slowly rotate your head</p>
              <p className="text-muted-foreground">
                Look up, right, down, and left. We'll capture each angle automatically
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted p-3 rounded-lg text-sm">
          <p className="font-medium mb-1">Tips for best results:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Ensure good lighting on your face</li>
            <li>Remove glasses if possible</li>
            <li>Keep your face clearly visible</li>
            <li>Move slowly and smoothly</li>
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center space-y-2">
      <p className="text-lg font-medium">Scanning in progress...</p>
      <p className="text-sm text-muted-foreground">
        Rotate your head slowly through all positions
      </p>
    </div>
  )
}
