import { prepareColumns } from '@/shared/lib/utils/columns';
import { SegmentDeleteOneMutation } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { Badge } from '@/components/ui/badge';
import { segmentTypes, segmentStatuses } from '../../data/enums';

interface SegmentListItem {
  id: string;
  name: string;
  color: string;
  segment_type: string;
  status: string;
  created_at: string;
  memberships_aggregate?: { aggregate?: { count?: number } };
}

export const columnsInfo = prepareColumns<SegmentListItem>([
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
      <div className='flex items-center gap-2'>
        <span
          className='w-3 h-3 rounded-full shrink-0'
          style={{ backgroundColor: row.original.color }}
        />
        <span>{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: 'segment_type',
    enableSorting: true,
    meta: {
      title: 'Type',
      filters: [{ type: 'enum', enum: segmentTypes }],
    },
    cell: ({ row }) => (
      <Badge variant='outline'>
        {row.original.segment_type === 'rule_based' ? 'Rule-based' : 'Manual'}
      </Badge>
    ),
  },
  {
    id: 'members',
    enableSorting: false,
    meta: { title: 'Members' },
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {row.original.memberships_aggregate?.aggregate?.count ?? 0}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    enableSorting: true,
    meta: {
      title: 'Status',
      filters: [{ type: 'enum', enum: segmentStatuses }],
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        show
        deleteOptions={{ gqlMutation: SegmentDeleteOneMutation }}
      />
    ),
  },
]);
