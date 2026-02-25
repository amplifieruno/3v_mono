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
import { useNavigation, useResourceParams, useShow, useDelete } from '@refinedev/core';
import {
  ListIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
  LinkIcon,
  UnlinkIcon,
} from 'lucide-react';
import { FC, useState } from 'react';
import { Link } from 'react-router';
import {
  IdentityShowQuery,
  IdentityDeleteOneMutation,
  IdentityUpdateOneMutation,
} from '../../queries';
import { identityStatuses } from '../../data/enums';
import { LinkProfileDialog } from '../../components/LinkProfileDialog';
import { CreateProfileDialog } from '../../components/CreateProfileDialog';
import { gqlClient } from '@/shared/api/gql-client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString();
};

const formatJson = (value: unknown) => {
  if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0))
    return null;
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

interface DetectionRecord {
  id: string;
  created_at: string;
  confidence: number;
  similarity: number | null;
  thumbnail: string | null;
  device: { id: string; name: string } | null;
}

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl, list } = useNavigation();
  const { mutate: deleteMutate } = useDelete();
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { query } = useShow({
    meta: { gqlQuery: IdentityShowQuery },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;

  if (!record) {
    return <div>Loading...</div>;
  }

  const profile = record.profile as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  const images = (record.images ?? []) as string[];
  const detections = (record.detections ?? []) as DetectionRecord[];
  const attributes = record.attributes as Record<string, unknown> | null;
  const statusLabel =
    identityStatuses.find((s) => s.value === record.status)?.label ??
    (record.status as string);

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this identity?')) {
      deleteMutate(
        {
          resource: 'itap_identities',
          id: id ?? '',
          meta: { gqlMutation: IdentityDeleteOneMutation },
        },
        {
          onSuccess: () => list('itap_identities'),
        },
      );
    }
  };

  const handleUnlinkProfile = async () => {
    if (!confirm('Are you sure you want to unlink this profile?')) return;
    try {
      await gqlClient.request({
        document: IdentityUpdateOneMutation,
        variables: { id, object: { profile_id: null } },
      });
      toast.success('Profile unlinked successfully');
      queryClient.invalidateQueries({ queryKey: ['default', 'itap_identities'] });
      query.refetch();
    } catch {
      toast.error('Failed to unlink profile');
    }
  };

  const handleProfileLinked = () => {
    queryClient.invalidateQueries({ queryKey: ['default', 'itap_identities'] });
    query.refetch();
  };

  const formattedAttributes = formatJson(attributes);

  return (
    <div>
      {/* Header */}
      <div className='flex justify-between items-start'>
        <div>
          <h1 className='text-2xl font-semibold leading-none tracking-tight'>
            Identity
          </h1>
          <div className='mt-2 flex items-center gap-2'>
            <Badge>{statusLabel}</Badge>
            <span className='text-sm text-muted-foreground font-mono'>
              {(record.id as string).substring(0, 8)}...
            </span>
          </div>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to={editUrl('itap_identities', id ?? '')}>
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

      {/* Details card */}
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {/* Photos row */}
          {images.length > 0 && (
            <div>
              <span className='text-sm text-muted-foreground'>
                Photos ({images.length})
              </span>
              <div className='mt-1 flex -space-x-2'>
                {images.slice(0, 6).map((url, index) => (
                  <Avatar
                    key={index}
                    className='h-10 w-10 ring-2 ring-background'
                  >
                    <AvatarImage src={url} alt={`Photo ${index + 1}`} />
                    <AvatarFallback>
                      <UserIcon className='h-4 w-4' />
                    </AvatarFallback>
                  </Avatar>
                ))}
                {images.length > 6 && (
                  <Avatar className='h-10 w-10 ring-2 ring-background'>
                    <AvatarFallback className='text-xs font-medium'>
                      +{images.length - 6}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}

          <div>
            <span className='text-sm text-muted-foreground'>Status</span>
            <div>
              <Badge>{statusLabel}</Badge>
            </div>
          </div>
          <div>
            <span className='text-sm text-muted-foreground'>Profile</span>
            <div>
              {profile ? (
                <Link
                  to={`/profiles/show/${profile.id}`}
                  className='text-primary hover:underline font-medium'
                >
                  {profile.first_name} {profile.last_name}
                  {profile.email && (
                    <span className='text-muted-foreground text-sm ml-1'>
                      ({profile.email})
                    </span>
                  )}
                </Link>
              ) : (
                <span className='text-muted-foreground'>Not linked</span>
              )}
            </div>
          </div>
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

          {/* Actions */}
          <div className='pt-2 border-t flex gap-2'>
            {!profile ? (
              <>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <UserPlusIcon className='mr-1 h-4 w-4' />
                  Create Profile
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setLinkDialogOpen(true)}
                >
                  <LinkIcon className='mr-1 h-4 w-4' />
                  Link to Profile
                </Button>
              </>
            ) : (
              <Button
                variant='outline'
                size='sm'
                onClick={handleUnlinkProfile}
              >
                <UnlinkIcon className='mr-1 h-4 w-4' />
                Unlink Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attributes */}
      {formattedAttributes && (
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>Attributes</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='text-xs font-mono bg-muted p-2 rounded overflow-auto max-h-40'>
              {formattedAttributes}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Detection History */}
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>Detection History ({detections.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {detections.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No detections recorded.</p>
          ) : (
            <div className='overflow-auto max-h-[400px]'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Similarity</TableHead>
                    <TableHead>Face</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detections.map((det) => (
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
                          <span className='text-muted-foreground'>{'\u2014'}</span>
                        )}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {(det.confidence * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className='text-sm'>
                        {det.similarity != null
                          ? `${(det.similarity * 100).toFixed(1)}%`
                          : '\u2014'}
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

      {/* Dialogs */}
      <LinkProfileDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        identityId={id as string}
        onLinked={handleProfileLinked}
      />
      <CreateProfileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        identityId={id as string}
        onCreated={handleProfileLinked}
      />
    </div>
  );
};
