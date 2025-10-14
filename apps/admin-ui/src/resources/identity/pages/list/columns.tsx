import { prepareColumns } from '@/shared/lib/utils/columns';
import { IdentityDeleteOneMutation, IdentityFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';

export const columnsInfo = prepareColumns<IdentityFragment>([
  {
    accessorKey: 'id',
    enableSorting: true,
    enableHiding: false,
    meta: {
      title: 'ID',
    },
    cell: ({ row }) => <UuidView value={row.original.id} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        deleteOptions={{
          gqlMutation: IdentityDeleteOneMutation,
        }}
      />
    ),
  },
]);
