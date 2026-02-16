import { FC } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScanFaceIcon } from 'lucide-react';

interface RecognitionStatusProps {
  recognitionEnabled: boolean;
  detectionCount?: number;
}

export const RecognitionStatus: FC<RecognitionStatusProps> = ({
  recognitionEnabled,
  detectionCount = 0,
}) => {
  if (!recognitionEnabled) {
    return (
      <div className='flex items-center gap-1.5 bg-black/50 rounded px-2 py-1'>
        <span className='h-2 w-2 rounded-full bg-gray-400' />
        <span className='text-xs text-white'>Recognition Off</span>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-1.5 bg-black/50 rounded px-2 py-1'>
      <span className='h-2 w-2 rounded-full bg-green-500 animate-pulse' />
      <ScanFaceIcon className='h-3 w-3 text-white' />
      <span className='text-xs text-white'>Recognition Active</span>
      {detectionCount > 0 && (
        <Badge variant='secondary' className='h-4 px-1 text-[10px]'>
          {detectionCount}
        </Badge>
      )}
    </div>
  );
};
