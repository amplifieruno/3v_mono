/**
 * Face ID Enrollment Debug Tab
 *
 * Test the face enrollment scanning widget with 9-position capture
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, CheckCircle2 } from 'lucide-react';
import {
  FaceScannerProvider,
  FaceScannerScanningMask,
  FaceScannerCamera,
  useFaceScannerState
} from '@/domains/face-scanner';
import type { CaptureResult } from '@/domains/face-scanner';

/**
 * Debug Info Component - shows current head pose and target
 */
function ScanningDebugInfo() {
  const detectionResult = useFaceScannerState(state => state.lastDetectionResult);
  const scanningSession = useFaceScannerState(state => state.scanningSession);

  const headPose = detectionResult?.headPose;
  const target = scanningSession?.currentTargetPosition;

  if (!scanningSession?.isScanning) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        left: '10px',
        padding: '0.5rem',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      <div>Current: yaw={headPose?.yaw.toFixed(2) ?? '?'} pitch={headPose?.pitch.toFixed(2) ?? '?'}</div>
      {target && (
        <div style={{ color: '#ffff00' }}>
          Target: {target.position} (
          yaw: {target.yawMin?.toFixed(2) ?? '-∞'} to {target.yawMax?.toFixed(2) ?? '+∞'},
          pitch: {target.pitchMin?.toFixed(2) ?? '-∞'} to {target.pitchMax?.toFixed(2) ?? '+∞'}
          )
        </div>
      )}
      <div style={{ marginTop: '0.25rem', color: '#00ff00' }}>
        Captured: {scanningSession?.captures.length ?? 0}/5
      </div>
    </div>
  );
}

/**
 * Enrollment Debug Tab Component
 */
export function EnrollmentDebugTab() {
  const [isScanning, setIsScanning] = useState(false);
  const [captures, setCaptures] = useState<CaptureResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartScanning = () => {
    setIsScanning(true);
    setCaptures(null);
    setError(null);
  };

  const handleScanComplete = (results: CaptureResult[]) => {
    console.log('Scan complete!', results);
    setCaptures(results);
    setIsScanning(false);
  };

  const handleError = (errorMessage: string) => {
    console.error('Scanning error:', errorMessage);
    setError(errorMessage);
  };

  const handleReset = () => {
    setIsScanning(false);
    setCaptures(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      {!isScanning && !captures && (
        <Card>
          <CardHeader>
            <CardTitle>Face ID Enrollment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This widget captures 9 photos of your face from different angles for enrollment:
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Position your face in the center of the circle</li>
              <li>Hold still for 1 second to capture the center position</li>
              <li>Rotate your head in a circle to capture all 8 surrounding positions</li>
              <li>The indicators will turn green as positions are captured</li>
              <li>The session will auto-reset if your face is lost or multiple faces are detected</li>
            </ul>
            <Button onClick={handleStartScanning} className="w-full" size="lg">
              <Camera className="mr-2 h-5 w-5" />
              Start Enrollment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scanning Widget */}
      {isScanning && (
        <Card>
          <CardContent className="p-0">
            <div className="aspect-video bg-black relative">
              <FaceScannerProvider>
                <FaceScannerScanningMask
                  onScanComplete={handleScanComplete}
                  onError={handleError}
                  style={{
                    position: 'absolute',
                    inset: 0
                  }}
                >
                  <FaceScannerCamera
                    style={{
                      position: 'absolute',
                      inset: 0
                    }}
                  />
                </FaceScannerScanningMask>

                {/* Debug Info */}
                <ScanningDebugInfo />
              </FaceScannerProvider>

              {/* Cancel button */}
              <div className="absolute top-4 right-4 z-20">
                <Button onClick={handleReset} variant="secondary" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display */}
      {captures && captures.length > 0 && (
        <div className="space-y-6">
          {/* Success message */}
          <Card className="border-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Enrollment Complete!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Successfully captured {captures.length} positions. Below are the results:
              </p>
              <Button onClick={handleReset} className="mt-4" variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>

          {/* Captured Images Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Captured Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {captures.map((capture) => (
                  <div key={capture.id} className="space-y-2">
                    {/* Head crop */}
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                      <img
                        src={capture.headImage}
                        alt={`${capture.id} position`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Position info */}
                    <div className="space-y-1">
                      <p className="text-sm font-medium capitalize">
                        {capture.id.replace('-', ' ')}
                      </p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Yaw: {capture.headPose.yaw.toFixed(1)}°</div>
                        <div>Pitch: {capture.headPose.pitch.toFixed(1)}°</div>
                        <div>Roll: {capture.headPose.roll.toFixed(1)}°</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Full Images (Optional - for debugging) */}
          <details>
            <summary className="cursor-pointer text-sm font-medium mb-4">
              Show Full Frame Captures
            </summary>
            <div className="grid grid-cols-3 gap-4">
              {captures.map((capture) => (
                <div key={`full-${capture.id}`} className="space-y-2">
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={capture.fullImage}
                      alt={`${capture.id} full frame`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {capture.id.replace('-', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={handleReset} className="mt-4" variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
