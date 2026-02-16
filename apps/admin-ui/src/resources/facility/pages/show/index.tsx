import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigation, useResourceParams, useShow } from '@refinedev/core';
import { ListIcon, PencilIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { FacilityWithAreasQuery } from '../../queries';
import { AreaHierarchy } from '@/resources/area/components/AreaHierarchy';

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl } = useNavigation();

  const { query } = useShow({
    meta: { gqlQuery: FacilityWithAreasQuery },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;

  if (!record) {
    return <div>Loading...</div>;
  }

  const areas = (record.areas ?? []) as Array<{
    id: string;
    name: string;
    area_type: string;
    access_level: string;
    parent_id: string | null;
    status: string;
    capacity: number | null;
  }>;

  return (
    <div>
      <div className='flex justify-between'>
        <h1 className='text-2xl font-semibold leading-none tracking-tight'>
          {record.name as string}
        </h1>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to={editUrl('itap_facilities', id ?? '')}>
              <PencilIcon /> Edit
            </Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link to={listUrl(identifier ?? '')}>
              <ListIcon /> Back to list
            </Link>
          </Button>
        </div>
      </div>

      <div className='mt-4 grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div>
              <span className='text-sm text-muted-foreground'>Status</span>
              <div>
                <Badge>{record.status as string}</Badge>
              </div>
            </div>
            {record.description ? (
              <div>
                <span className='text-sm text-muted-foreground'>
                  Description
                </span>
                <p>{String(record.description)}</p>
              </div>
            ) : null}
            {record.address ? (
              <div>
                <span className='text-sm text-muted-foreground'>Address</span>
                <p>{String(record.address)}</p>
              </div>
            ) : null}
            <div>
              <span className='text-sm text-muted-foreground'>Timezone</span>
              <p>{record.timezone as string}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Areas ({areas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {areas.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                No areas defined yet.
              </p>
            ) : (
              <AreaHierarchy areas={areas} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
