import { FC, useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserIcon, ScanFaceIcon } from 'lucide-react';
import { Link } from 'react-router';
import io, { Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '@/shared/api/gql-client';
import { DeviceDetectionsQuery } from '../queries';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface Detection {
  id: string;
  created_at: string;
  confidence: number;
  similarity: number | null;
  is_new_identity: boolean;
  bbox: unknown;
  thumbnail: string | null;
  identity: {
    id: string;
    status: string;
    attributes: Record<string, unknown>;
  } | null;
}

interface LiveDetectionsProps {
  deviceId: string;
  recognitionEnabled: boolean;
}

const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString();
};

const formatRelativeTime = (dateStr: string): string => {
  const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const getIdentityLabel = (detection: Detection): string => {
  if (detection.is_new_identity) return 'NEW';
  if (detection.identity?.attributes) {
    const attrs = detection.identity.attributes as Record<string, string>;
    if (attrs.name) return attrs.name;
  }
  if (detection.identity?.id) {
    return `ID-${detection.identity.id.substring(0, 6)}`;
  }
  return 'Unknown';
};

const FaceThumbnail: FC<{
  thumbnail: string | null;
  size?: 'sm' | 'lg';
}> = ({ thumbnail, size = 'sm' }) => {
  const sizeClass = size === 'lg' ? 'h-16 w-16' : 'h-8 w-8';
  const iconSize = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';

  return (
    <Avatar className={sizeClass}>
      {thumbnail ? (
        <AvatarImage src={`data:image/jpeg;base64,${thumbnail}`} />
      ) : null}
      <AvatarFallback>
        <UserIcon className={iconSize} />
      </AvatarFallback>
    </Avatar>
  );
};

export const LiveDetections: FC<LiveDetectionsProps> = ({
  deviceId,
  recognitionEnabled,
}) => {
  const [liveDetections, setLiveDetections] = useState<Detection[]>([]);
  const socketRef = useRef<Socket | null>(null);

  // Load historical detections from DB
  const { data: queryData } = useQuery({
    queryKey: ['device-detections', deviceId],
    queryFn: async () => {
      const result = await gqlClient.request({
        document: DeviceDetectionsQuery,
        variables: { device_id: deviceId, limit: 50 },
      });
      return result as { itap_detections: Detection[] };
    },
  });

  const dbDetections = queryData?.itap_detections;

  // Merge: live detections first, then DB detections (deduplicated)
  const allDetections = useCallback((): Detection[] => {
    const liveIds = new Set(liveDetections.map((d) => d.id));
    const fromDb = (dbDetections ?? []).filter((d) => !liveIds.has(d.id));
    return [...liveDetections, ...fromDb].slice(0, 50);
  }, [liveDetections, dbDetections]);

  // WebSocket connection
  useEffect(() => {
    if (!recognitionEnabled) {
      if (socketRef.current) {
        socketRef.current.emit('leave-device', { deviceId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.emit('join-device', { deviceId });

    socket.on('detection', (data: Detection) => {
      setLiveDetections((prev) => [data, ...prev].slice(0, 50));
    });

    return () => {
      socket.emit('leave-device', { deviceId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deviceId, recognitionEnabled]);

  const detections = allDetections();
  const recentFaces = detections.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <ScanFaceIcon className='h-5 w-5' />
            Live Detections
          </CardTitle>
          {detections.length > 0 && (
            <Badge variant='secondary'>{detections.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Empty state when recognition is off */}
        {!recognitionEnabled && detections.length === 0 && (
          <p className='text-sm text-muted-foreground text-center py-6'>
            Enable face recognition to see live detections
          </p>
        )}

        {/* Recent faces strip */}
        {recentFaces.length > 0 && (
          <div>
            <p className='text-xs text-muted-foreground mb-2'>Recent Faces</p>
            <ScrollArea className='w-full'>
              <div className='flex gap-3 pb-2'>
                {recentFaces.map((det) => (
                  <RecentFaceCard key={det.id} detection={det} />
                ))}
              </div>
              <ScrollBar orientation='horizontal' />
            </ScrollArea>
          </div>
        )}

        {/* Detection history table */}
        {detections.length > 0 && (
          <div>
            <p className='text-xs text-muted-foreground mb-2'>Detection History</p>
            <div className='overflow-auto max-h-[300px]'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Face</TableHead>
                    <TableHead>Identity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>New?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detections.slice(0, 20).map((det) => (
                    <TableRow key={det.id}>
                      <TableCell className='text-xs'>
                        {formatTime(det.created_at)}
                      </TableCell>
                      <TableCell>
                        <FaceThumbnail thumbnail={det.thumbnail} />
                      </TableCell>
                      <TableCell>
                        {det.identity ? (
                          <Link
                            to={`/identities/show/${det.identity.id}`}
                            className='text-sm text-primary hover:underline'
                          >
                            {getIdentityLabel(det)}
                          </Link>
                        ) : (
                          <span className='text-sm text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {(det.confidence * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {det.is_new_identity ? (
                          <Badge variant='default' className='text-xs'>NEW</Badge>
                        ) : (
                          <span className='text-xs text-muted-foreground'>No</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const RecentFaceCard: FC<{ detection: Detection }> = ({ detection }) => {
  const label = getIdentityLabel(detection);
  const content = (
    <div className='flex flex-col items-center gap-1 min-w-[80px]'>
      <FaceThumbnail thumbnail={detection.thumbnail} size='lg' />
      <span className='text-xs font-medium truncate max-w-[80px]'>
        {label}
      </span>
      <span className='text-[10px] text-muted-foreground'>
        {(detection.confidence * 100).toFixed(1)}%
      </span>
      <span className='text-[10px] text-muted-foreground'>
        {formatRelativeTime(detection.created_at)}
      </span>
    </div>
  );

  if (detection.identity) {
    return (
      <Link
        to={`/identities/show/${detection.identity.id}`}
        className='hover:opacity-80 transition-opacity'
      >
        {content}
      </Link>
    );
  }

  return content;
};
