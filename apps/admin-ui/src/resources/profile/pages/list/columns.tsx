import { prepareColumns } from '@/shared/lib/utils/columns';
import { ProfileDeleteOneMutation, ProfileFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';

export const columnsInfo = prepareColumns<ProfileFragment>([
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
    accessorKey: 'first_name',
    enableSorting: true,
    enableHiding: true,
    meta: {
      title: 'First Name',
    },
  },
  {
    accessorKey: 'last_name',
    enableSorting: true,
    enableHiding: true,
    meta: {
      title: 'Last Name',
    },
  },
  {
    accessorKey: 'email',
    enableSorting: true,
    enableHiding: true,
    meta: {
      title: 'Email',
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        recordId={row.original.id}
        edit
        deleteOptions={{
          gqlMutation: ProfileDeleteOneMutation,
        }}
      />
    ),
  },
]);
