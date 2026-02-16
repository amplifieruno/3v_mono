import { prepareColumns } from '@/shared/lib/utils/columns';
import { DeviceDeleteOneMutation, DeviceFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { Badge } from '@/components/ui/badge';
import {
  deviceTypes,
  deviceStatuses,
  healthStatuses,
  deviceStatusColor,
  healthStatusColor,
} from '../../data/enums';
import { Link } from 'react-router';

const formatRelativeTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

export const columnsInfo = prepareColumns<DeviceFragment>([
  {
    accessorKey: 'id',
    enableSorting: true,
    enableHiding: false,
    meta: { title: 'ID' },
    cell: ({ row }) => <UuidView value={row.original.id} />,
  },
  {
    accessorKey: 'name',
    enableSorting: true,
    enableHiding: true,
    meta: { title: 'Name' },
    cell: ({ row }) => (
      <Link
        to={`/devices/show/${row.original.id}`}
        className='font-medium hover:underline'
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: 'device_type',
    enableSorting: true,
    meta: {
      title: 'Type',
      filters: [{ type: 'enum', enum: deviceTypes }],
    },
    cell: ({ row }) => (
      <Badge variant='outline'>
        {deviceTypes.find((t) => t.value === row.original.device_type)?.label ?? row.original.device_type}
      </Badge>
    ),
  },
  {
    id: 'area_name',
    accessorFn: (row) => row.area?.name,
    enableSorting: false,
    meta: { title: 'Area' },
    cell: ({ row }) => {
      const area = row.original.area;
      if (!area) return <span className='text-muted-foreground'>—</span>;
      return (
        <span>
          {area.name}
          {area.facility ? (
            <span className='text-muted-foreground text-xs ml-1'>
              ({area.facility.name})
            </span>
          ) : null}
        </span>
      );
    },
  },
  {
    accessorKey: 'stream_url',
    enableSorting: false,
    enableHiding: true,
    meta: { title: 'Stream URL' },
    cell: ({ row }) => {
      const url = row.original.stream_url;
      if (!url) return <span className='text-muted-foreground'>—</span>;
      return (
        <span className='font-mono text-xs truncate max-w-[200px] inline-block'>
          {url}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    enableSorting: true,
    meta: {
      title: 'Status',
      filters: [{ type: 'enum', enum: deviceStatuses }],
    },
    cell: ({ row }) => (
      <Badge
        variant={deviceStatusColor(row.original.status) as 'default' | 'secondary' | 'destructive' | 'outline'}
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'health_status',
    enableSorting: true,
    meta: {
      title: 'Health',
      filters: [{ type: 'enum', enum: healthStatuses }],
    },
    cell: ({ row }) => (
      <Badge
        variant={healthStatusColor(row.original.health_status) as 'default' | 'secondary' | 'destructive' | 'outline'}
      >
        {row.original.health_status}
      </Badge>
    ),
  },
  {
    accessorKey: 'last_seen',
    enableSorting: true,
    enableHiding: true,
    meta: { title: 'Last Seen' },
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {formatRelativeTime(row.original.last_seen)}
      </span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        show
        deleteOptions={{ gqlMutation: DeviceDeleteOneMutation }}
      />
    ),
  },
]);
