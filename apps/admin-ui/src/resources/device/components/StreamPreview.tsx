import { FC, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VideoOffIcon, RefreshCwIcon } from 'lucide-react';

interface StreamPreviewProps {
  streamUrl: string | null;
  deviceName: string;
  status: string;
}

const getWebRtcUrl = (rtspUrl: string): string => {
  const base = import.meta.env.VITE_MEDIAMTX_WEBRTC_BASE || 'http://localhost:8889';
  try {
    const url = new URL(rtspUrl);
    const streamPath = url.pathname.replace(/^\//, '');
    return `${base}/${streamPath}`;
  } catch {
    const match = rtspUrl.match(/\/([^/]+)$/);
    const streamPath = match?.[1] ?? rtspUrl;
    return `${base}/${streamPath}`;
  }
};

export const StreamPreview: FC<StreamPreviewProps> = ({ streamUrl, deviceName, status }) => {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setRetryKey((k) => k + 1);
  }, []);

  const handleIframeError = useCallback(() => {
    setHasError(true);
  }, []);

  // No stream URL
  if (!streamUrl) {
    return (
      <div className='relative aspect-video bg-muted rounded-lg flex items-center justify-center'>
        <div className='text-center text-muted-foreground'>
          <VideoOffIcon className='mx-auto h-10 w-10 mb-2' />
          <p className='text-sm'>No stream configured</p>
        </div>
      </div>
    );
  }

  // Device not active
  if (status !== 'active') {
    return (
      <div className='relative aspect-video bg-muted rounded-lg flex items-center justify-center'>
        <div className='text-center text-muted-foreground'>
          <VideoOffIcon className='mx-auto h-10 w-10 mb-2' />
          <p className='text-sm'>Device is {status}</p>
        </div>
        <div className='absolute top-2 right-2'>
          <Badge variant='secondary'>{status}</Badge>
        </div>
      </div>
    );
  }

  const webRtcUrl = getWebRtcUrl(streamUrl);

  // Error state
  if (hasError) {
    return (
      <div className='relative aspect-video bg-muted rounded-lg flex items-center justify-center'>
        <div className='text-center text-muted-foreground'>
          <VideoOffIcon className='mx-auto h-10 w-10 mb-2' />
          <p className='text-sm mb-2'>Unable to connect to stream</p>
          <Button variant='outline' size='sm' onClick={handleRetry}>
            <RefreshCwIcon className='mr-1 h-3 w-3' />
            Retry
          </Button>
        </div>
        <div className='absolute top-2 left-2'>
          <div className='flex items-center gap-1.5'>
            <span className='h-2 w-2 rounded-full bg-destructive' />
            <span className='text-xs text-muted-foreground'>Error</span>
          </div>
        </div>
      </div>
    );
  }

  // Active stream
  return (
    <div className='relative aspect-video bg-black rounded-lg overflow-hidden'>
      <iframe
        key={retryKey}
        src={webRtcUrl}
        className='w-full h-full border-0'
        allow='autoplay'
        title={`Stream: ${deviceName}`}
        onError={handleIframeError}
      />
      <div className='absolute top-2 left-2'>
        <div className='flex items-center gap-1.5 bg-black/50 rounded px-2 py-1'>
          <span className='h-2 w-2 rounded-full bg-green-500 animate-pulse' />
          <span className='text-xs text-white'>LIVE</span>
        </div>
      </div>
      <div className='absolute bottom-2 left-2'>
        <span className='text-xs text-white/70 bg-black/50 rounded px-2 py-1'>
          {deviceName}
        </span>
      </div>
    </div>
  );
};
