/**
 * Face Tracking Debug Tab
 *
 * Real-time face detection and head pose tracking visualization
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FaceScannerProvider,
  FaceScannerMask,
  FaceScannerCamera,
  useFaceScannerState
} from '@/domains/face-scanner';

/**
 * Debug Info Component - displays face detection data
 * Uses the face scanner state from context
 */
function DebugInfo() {
  const detectionResult = useFaceScannerState(state => state.lastDetectionResult);
  const isCameraActive = useFaceScannerState(state => state.isCameraActive);

  const faceCount = detectionResult?.faceCount || 0;
  const headPose = detectionResult?.headPose;

  return (
    <div className="space-y-6">
      {/* Face count */}
      <Card>
        <CardHeader>
          <CardTitle>Face Detection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Faces detected:</span>
              <span className="font-bold text-lg">{faceCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Head pose data */}
      <Card>
        <CardHeader>
          <CardTitle>Head Pose</CardTitle>
        </CardHeader>
        <CardContent>
          {headPose ? (
            <div className="space-y-3">
              {/* Yaw */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Yaw (left/right):</span>
                  <span className="font-mono font-bold">
                    {headPose.yaw.toFixed(1)}°
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{
                      width: '50%',
                      marginLeft: `${Math.max(0, Math.min(100, 50 + headPose.yaw))}%`,
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              </div>

              {/* Pitch */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Pitch (up/down):</span>
                  <span className="font-mono font-bold">
                    {headPose.pitch.toFixed(1)}°
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{
                      width: '50%',
                      marginLeft: `${Math.max(0, Math.min(100, 50 + headPose.pitch))}%`,
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              </div>

              {/* Roll */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Roll (tilt):</span>
                  <span className="font-mono font-bold">
                    {headPose.roll.toFixed(1)}°
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{
                      width: '50%',
                      marginLeft: `${Math.max(0, Math.min(100, 50 + headPose.roll))}%`,
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              {isCameraActive ? 'No face detected' : 'Camera not active'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Info</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>Yaw:</strong> Rotation left (-) / right (+)</p>
          <p><strong>Pitch:</strong> Rotation up (+) / down (-)</p>
          <p><strong>Roll:</strong> Tilt left (-) / right (+)</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Tracking Debug Tab Component
 */
export function TrackingDebugTab() {
  return (
    <FaceScannerProvider>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera feed with mask overlay */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="aspect-video bg-black relative">
                <FaceScannerMask
                  style={{
                    position: 'absolute',
                    inset: 0
                  }}
                  maskBorderColor="rgba(0, 255, 0, 0.8)"
                  maskColor="rgba(0, 255, 0, 0.1)"
                >
                  <FaceScannerCamera
                    style={{
                      position: 'absolute',
                      inset: 0
                    }}
                  />
                </FaceScannerMask>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data display */}
        <DebugInfo />
      </div>
    </FaceScannerProvider>
  );
}
