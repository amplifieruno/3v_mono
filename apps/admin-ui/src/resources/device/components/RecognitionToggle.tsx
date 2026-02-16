import { FC, useCallback, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScanFaceIcon, Loader2Icon } from 'lucide-react';
import { useUpdate } from '@refinedev/core';
import { DeviceUpdateOneMutation } from '../queries';

interface RecognitionStatus {
  isRunning: boolean;
  framesProcessed: number;
  facesDetected: number;
  errors: number;
  startedAt: string | null;
}

interface RecognitionToggleProps {
  deviceId: string;
  recognitionEnabled: boolean;
  recognitionFps: number;
  streamUrl: string | null;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const FPS_OPTIONS = [1, 2, 3, 4, 5] as const;

const formatDuration = (startedAt: string | null): string => {
  if (!startedAt) return '';
  const diff = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const RecognitionToggle: FC<RecognitionToggleProps> = ({
  deviceId,
  recognitionEnabled,
  recognitionFps,
  streamUrl,
}) => {
  const { mutate: updateDevice } = useUpdate();
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState<RecognitionStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasStream = Boolean(streamUrl);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/recognition/status/${deviceId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Backend may not be running yet — ignore
    }
  }, [deviceId]);

  useEffect(() => {
    if (recognitionEnabled) {
      fetchStatus();
      pollRef.current = setInterval(fetchStatus, 5000);
    } else {
      setStatus(null);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [recognitionEnabled, fetchStatus]);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setToggling(true);
      try {
        // Fire-and-forget to backend for instant response
        fetch(`${BACKEND_URL}/api/recognition/${enabled ? 'start' : 'stop'}/${deviceId}`, {
          method: 'POST',
        }).catch(() => {});

        // Persist to Hasura
        updateDevice({
          resource: 'itap_devices',
          id: deviceId,
          values: { recognition_enabled: enabled },
          meta: { gqlMutation: DeviceUpdateOneMutation },
        });
      } finally {
        setToggling(false);
      }
    },
    [deviceId, updateDevice],
  );

  const handleFpsChange = useCallback(
    (fps: number) => {
      updateDevice({
        resource: 'itap_devices',
        id: deviceId,
        values: { recognition_fps: fps },
        meta: { gqlMutation: DeviceUpdateOneMutation },
      });
    },
    [deviceId, updateDevice],
  );

  const toggleControl = (
    <div className='flex items-center gap-2'>
      {toggling && <Loader2Icon className='h-4 w-4 animate-spin text-muted-foreground' />}
      <Switch
        checked={recognitionEnabled}
        onCheckedChange={handleToggle}
        disabled={!hasStream || toggling}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <ScanFaceIcon className='h-5 w-5' />
            Face Recognition
          </CardTitle>
          {hasStream ? (
            toggleControl
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>{toggleControl}</TooltipTrigger>
              <TooltipContent>Configure stream URL first</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* FPS Selector */}
        <div className='space-y-2'>
          <Label className='text-sm text-muted-foreground'>Capture rate</Label>
          <div className='flex items-center gap-2'>
            {FPS_OPTIONS.map((fps) => (
              <Button
                key={fps}
                size='sm'
                variant={recognitionFps === fps ? 'default' : 'outline'}
                className='h-8 w-8 p-0'
                onClick={() => handleFpsChange(fps)}
                disabled={!hasStream}
              >
                {fps}
              </Button>
            ))}
            <span className='text-sm text-muted-foreground ml-1'>fps</span>
          </div>
        </div>

        {/* Status line */}
        {recognitionEnabled && status ? (
          <div className='text-sm space-y-1'>
            <div className='flex items-center gap-2'>
              <span
                className={`h-2 w-2 rounded-full ${status.isRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}
              />
              <span className='text-muted-foreground'>
                {status.isRunning ? 'Processing' : 'Stopped'}
                {' — '}
                {status.facesDetected} faces detected
              </span>
            </div>
            {status.startedAt && (
              <p className='text-xs text-muted-foreground ml-4'>
                Session running for {formatDuration(status.startedAt)}
              </p>
            )}
          </div>
        ) : !recognitionEnabled ? (
          <p className='text-sm text-muted-foreground'>
            Enable recognition to start processing video frames
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
