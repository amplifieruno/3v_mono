import { prepareColumns } from '@/shared/lib/utils/columns';
import { AreaDeleteOneMutation, AreaFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { Badge } from '@/components/ui/badge';
import { areaTypes, accessLevels, areaStatuses } from '../../data/enums';

const accessLevelColor = (level: string) => {
  switch (level) {
    case 'public':
      return 'default';
    case 'restricted':
      return 'secondary';
    case 'secure':
      return 'destructive';
    case 'classified':
      return 'outline';
    default:
      return 'secondary';
  }
};

export const columnsInfo = prepareColumns<AreaFragment>([
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
  },
  {
    accessorKey: 'area_type',
    enableSorting: true,
    meta: {
      title: 'Type',
      filters: [{ type: 'enum', enum: areaTypes }],
    },
    cell: ({ row }) => (
      <Badge variant='outline'>{row.original.area_type}</Badge>
    ),
  },
  {
    accessorKey: 'access_level',
    enableSorting: true,
    meta: {
      title: 'Access Level',
      filters: [{ type: 'enum', enum: accessLevels }],
    },
    cell: ({ row }) => (
      <Badge
        variant={accessLevelColor(row.original.access_level) as 'default' | 'secondary' | 'destructive' | 'outline'}
      >
        {row.original.access_level}
      </Badge>
    ),
  },
  {
    id: 'facility_name',
    accessorFn: (row) => row.facility?.name,
    enableSorting: false,
    meta: { title: 'Facility' },
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {row.original.facility?.name ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    enableSorting: true,
    meta: {
      title: 'Status',
      filters: [{ type: 'enum', enum: areaStatuses }],
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        deleteOptions={{ gqlMutation: AreaDeleteOneMutation }}
      />
    ),
  },
]);
