import { prepareColumns } from '@/shared/lib/utils/columns';
import { FacilityDeleteOneMutation, FacilityFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { Badge } from '@/components/ui/badge';
import { facilityStatuses } from '../../data/enums';

const statusVariant = (status: string) => {
  switch (status) {
    case 'active':
      return 'default';
    case 'inactive':
      return 'secondary';
    case 'maintenance':
      return 'outline';
    default:
      return 'secondary';
  }
};

export const columnsInfo = prepareColumns<FacilityFragment>([
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
    accessorKey: 'address',
    enableSorting: true,
    enableHiding: true,
    meta: { title: 'Address' },
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {row.original.address || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    enableSorting: true,
    meta: {
      title: 'Status',
      filters: [{ type: 'enum', enum: facilityStatuses }],
    },
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'timezone',
    enableSorting: true,
    enableHiding: true,
    meta: { title: 'Timezone' },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        show
        deleteOptions={{ gqlMutation: FacilityDeleteOneMutation }}
      />
    ),
  },
]);
