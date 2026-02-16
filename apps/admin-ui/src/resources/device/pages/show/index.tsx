import { Button } from '@/components/ui/button';
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
import { useNavigation, useResourceParams, useShow, useDelete } from '@refinedev/core';
import { ListIcon, PencilIcon, TrashIcon, CopyIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { DeviceOneQuery, DeviceDeleteOneMutation } from '../../queries';
import { deviceTypes, deviceStatusColor, healthStatusColor } from '../../data/enums';
import { StreamPreview } from '../../components/StreamPreview';
import { RecognitionToggle } from '../../components/RecognitionToggle';
import { RecognitionStatus } from '../../components/RecognitionStatus';
import { LiveDetections } from '../../components/LiveDetections';

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
};

const formatJson = (value: unknown) => {
  if (!value) return '—';
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl, list } = useNavigation();
  const { mutate: deleteMutate } = useDelete();

  const { query } = useShow({
    meta: { gqlQuery: DeviceOneQuery },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;

  if (!record) {
    return <div>Loading...</div>;
  }

  const area = record.area as { id: string; name: string; facility?: { id: string; name: string } } | null;
  const healthMetrics = (record.health_metrics ?? []) as Array<{
    id: string;
    timestamp: string;
    cpu_usage: number | null;
    memory_usage: number | null;
    disk_usage: number | null;
    network_latency: number | null;
    frame_rate: number | null;
    error_count: number | null;
  }>;

  const recognitionEnabled = Boolean(record.recognition_enabled);
  const recognitionFps = (record.recognition_fps as number) ?? 2;

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this device?')) {
      deleteMutate(
        {
          resource: 'itap_devices',
          id: id ?? '',
          meta: { gqlMutation: DeviceDeleteOneMutation },
        },
        {
          onSuccess: () => list('itap_devices'),
        },
      );
    }
  };

  const deviceTypeLabel = deviceTypes.find((t) => t.value === record.device_type)?.label ?? record.device_type;

  return (
    <div>
      {/* Header */}
      <div className='flex justify-between items-start'>
        <div>
          <h1 className='text-2xl font-semibold leading-none tracking-tight'>
            {record.name as string}
          </h1>
          <div className='mt-2 flex items-center gap-2'>
            <Badge
              variant={deviceStatusColor(record.status as string) as 'default' | 'secondary' | 'destructive' | 'outline'}
            >
              {record.status as string}
            </Badge>
            <Badge
              variant={healthStatusColor(record.health_status as string) as 'default' | 'secondary' | 'destructive' | 'outline'}
            >
              {record.health_status as string}
            </Badge>
            {record.last_seen ? (
              <span className='text-sm text-muted-foreground'>
                Last seen: {formatDate(record.last_seen as string)}
              </span>
            ) : null}
          </div>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to={editUrl('itap_devices', id ?? '')}>
              <PencilIcon /> Edit
            </Link>
          </Button>
          <Button variant='outline' size='sm' onClick={handleDelete}>
            <TrashIcon /> Delete
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link to={listUrl(identifier ?? '')}>
              <ListIcon /> Back to list
            </Link>
          </Button>
        </div>
      </div>

      {/* Stream Preview with Recognition Status overlay */}
      <div className='mt-4'>
        <Card>
          <CardHeader>
            <CardTitle>Stream Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='relative'>
              <StreamPreview
                streamUrl={record.stream_url as string | null}
                deviceName={record.name as string}
                status={record.status as string}
              />
              {/* Recognition status overlay — bottom right */}
              <div className='absolute bottom-2 right-2'>
                <RecognitionStatus recognitionEnabled={recognitionEnabled} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recognition Toggle + Device Details */}
      <div className='mt-4 grid gap-4 md:grid-cols-2'>
        <RecognitionToggle
          deviceId={String(id ?? '')}
          recognitionEnabled={recognitionEnabled}
          recognitionFps={recognitionFps}
          streamUrl={record.stream_url as string | null}
        />

        <Card>
          <CardHeader>
            <CardTitle>Device Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div>
              <span className='text-sm text-muted-foreground'>Type</span>
              <div>
                <Badge variant='outline'>{deviceTypeLabel as string}</Badge>
              </div>
            </div>
            <div>
              <span className='text-sm text-muted-foreground'>Area</span>
              <p>
                {area ? (
                  <>
                    {area.name}
                    {area.facility ? (
                      <span className='text-muted-foreground text-sm ml-1'>
                        ({area.facility.name})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </p>
            </div>
            {record.stream_url ? (
              <div>
                <span className='text-sm text-muted-foreground'>Stream URL</span>
                <div className='flex items-center gap-2'>
                  <code className='text-sm font-mono bg-muted px-2 py-1 rounded'>
                    {record.stream_url as string}
                  </code>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => copyToClipboard(record.stream_url as string)}
                  >
                    <CopyIcon className='h-3 w-3' />
                  </Button>
                </div>
              </div>
            ) : null}
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <span className='text-sm text-muted-foreground'>Resolution</span>
                <p>{(record.resolution as string) || '—'}</p>
              </div>
              <div>
                <span className='text-sm text-muted-foreground'>FPS</span>
                <p>{record.fps != null ? String(record.fps) : '—'}</p>
              </div>
            </div>
            {record.configuration ? (
              <div>
                <span className='text-sm text-muted-foreground'>Configuration</span>
                <pre className='text-xs font-mono bg-muted p-2 rounded mt-1 overflow-auto max-h-40'>
                  {formatJson(record.configuration)}
                </pre>
              </div>
            ) : null}
            <div className='grid grid-cols-2 gap-4 pt-2 border-t'>
              <div>
                <span className='text-sm text-muted-foreground'>Created</span>
                <p className='text-sm'>{formatDate(record.created_at as string)}</p>
              </div>
              <div>
                <span className='text-sm text-muted-foreground'>Updated</span>
                <p className='text-sm'>{formatDate(record.updated_at as string)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Detections */}
      <div className='mt-4'>
        <LiveDetections
          deviceId={String(id ?? '')}
          recognitionEnabled={recognitionEnabled}
        />
      </div>

      {/* Health Metrics */}
      <div className='mt-4'>
        <Card>
          <CardHeader>
            <CardTitle>Health Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {healthMetrics.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                No health data available.
              </p>
            ) : (
              <div className='overflow-auto max-h-[400px]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>Memory</TableHead>
                      <TableHead>Disk</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>FPS</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthMetrics.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className='text-xs'>
                          {formatDate(m.timestamp)}
                        </TableCell>
                        <TableCell>{m.cpu_usage != null ? `${m.cpu_usage}%` : '—'}</TableCell>
                        <TableCell>{m.memory_usage != null ? `${m.memory_usage}%` : '—'}</TableCell>
                        <TableCell>{m.disk_usage != null ? `${m.disk_usage}%` : '—'}</TableCell>
                        <TableCell>{m.network_latency != null ? `${m.network_latency}ms` : '—'}</TableCell>
                        <TableCell>{m.frame_rate != null ? String(m.frame_rate) : '—'}</TableCell>
                        <TableCell>{m.error_count != null ? String(m.error_count) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
