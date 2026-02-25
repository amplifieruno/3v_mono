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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useNavigation, useResourceParams, useShow, useDelete } from '@refinedev/core';
import { ListIcon, PencilIcon, TrashIcon, UserIcon } from 'lucide-react';
import { FC, useMemo } from 'react';
import { Link } from 'react-router';
import { ProfileShowQuery, ProfileDeleteOneMutation } from '../../queries';

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString();
};

interface IdentityRecord {
  id: string;
  images: string[];
  status: string;
  created_at: string;
  detections: DetectionRecord[];
}

interface DetectionRecord {
  id: string;
  created_at: string;
  confidence: number;
  similarity: number | null;
  thumbnail: string | null;
  device: { id: string; name: string } | null;
}

interface FlatDetection extends DetectionRecord {
  identity_id: string;
}

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl, list } = useNavigation();
  const { mutate: deleteMutate } = useDelete();

  const { query } = useShow({
    meta: { gqlQuery: ProfileShowQuery },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;
  const identities = useMemo(
    () => (record?.identities ?? []) as IdentityRecord[],
    [record?.identities],
  );

  // Flatten detections from all identities, sort by date
  const allDetections = useMemo<FlatDetection[]>(() => {
    const flat: FlatDetection[] = [];
    for (const identity of identities) {
      for (const det of identity.detections ?? []) {
        flat.push({ ...det, identity_id: identity.id });
      }
    }
    flat.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return flat.slice(0, 50);
  }, [identities]);

  if (!record) {
    return <div>Loading...</div>;
  }

  const fullName = [record.first_name, record.last_name].filter(Boolean).join(' ') || 'Unnamed';
  const initials = [record.first_name as string, record.last_name as string]
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase())
    .join('');
  const firstImage = identities.find((i) => i.images?.length > 0)?.images[0];

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this profile?')) {
      deleteMutate(
        {
          resource: 'itap_profiles',
          id: id ?? '',
          meta: { gqlMutation: ProfileDeleteOneMutation },
        },
        {
          onSuccess: () => list('itap_profiles'),
        },
      );
    }
  };

  return (
    <div>
      {/* Header */}
      <div className='flex justify-between items-start'>
        <div className='flex items-center gap-4'>
          <Avatar className='h-16 w-16'>
            {firstImage ? (
              <AvatarImage src={firstImage} alt={fullName} />
            ) : null}
            <AvatarFallback className='text-lg'>
              {initials || <UserIcon className='h-6 w-6' />}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className='text-2xl font-semibold leading-none tracking-tight'>
              {fullName}
            </h1>
            {record.email ? (
              <p className='mt-1 text-sm text-muted-foreground'>
                {String(record.email)}
              </p>
            ) : null}
            <div className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
              <span>Created {formatDate(record.created_at as string)}</span>
              <span>\u00b7</span>
              <span>Updated {formatDate(record.updated_at as string)}</span>
            </div>
          </div>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to={editUrl('itap_profiles', id ?? '')}>
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

      {/* Linked Identities */}
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>Linked Identities ({identities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {identities.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No identities linked to this profile.
            </p>
          ) : (
            <ScrollArea className='w-full'>
              <div className='flex gap-3 pb-2'>
                {identities.map((identity) => (
                  <Link
                    key={identity.id}
                    to={`/identities/show/${identity.id}`}
                    className='flex flex-col items-center gap-2 min-w-[100px] p-3 rounded-lg border hover:bg-accent transition-colors'
                  >
                    <Avatar className='h-14 w-14'>
                      {identity.images?.[0] ? (
                        <AvatarImage src={identity.images[0]} />
                      ) : null}
                      <AvatarFallback>
                        <UserIcon className='h-5 w-5' />
                      </AvatarFallback>
                    </Avatar>
                    <Badge variant='outline' className='text-[10px]'>
                      {identity.status}
                    </Badge>
                    <span className='text-[10px] text-muted-foreground font-mono'>
                      {identity.id.substring(0, 8)}
                    </span>
                  </Link>
                ))}
              </div>
              <ScrollBar orientation='horizontal' />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detection History */}
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>Detection History ({allDetections.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {allDetections.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No detections recorded.</p>
          ) : (
            <div className='overflow-auto max-h-[400px]'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Identity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Face</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allDetections.map((det) => (
                    <TableRow key={det.id}>
                      <TableCell className='text-xs'>
                        {formatDate(det.created_at)}
                      </TableCell>
                      <TableCell>
                        {det.device ? (
                          <Link
                            to={`/devices/show/${det.device.id}`}
                            className='text-sm text-primary hover:underline'
                          >
                            {det.device.name}
                          </Link>
                        ) : (
                          <span className='text-muted-foreground'>\u2014</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/identities/show/${det.identity_id}`}
                          className='text-xs text-primary hover:underline font-mono'
                        >
                          {det.identity_id.substring(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className='text-sm'>
                        {(det.confidence * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Avatar className='h-8 w-8'>
                          {det.thumbnail ? (
                            <AvatarImage
                              src={`data:image/jpeg;base64,${det.thumbnail}`}
                            />
                          ) : null}
                          <AvatarFallback>
                            <UserIcon className='h-4 w-4' />
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
