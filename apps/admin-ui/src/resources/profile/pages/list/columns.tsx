import { prepareColumns } from '@/shared/lib/utils/columns';
import { ProfileDeleteOneMutation, ProfileFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { Link } from 'react-router';

export const columnsInfo = prepareColumns<ProfileFragment>([
  {
    accessorKey: 'id',
    enableSorting: true,
    enableHiding: false,
    meta: {
      title: 'ID',
    },
    cell: ({ row }) => (
      <Link
        to={`/profiles/show/${row.original.id}`}
        className='text-primary hover:underline'
      >
        <UuidView value={row.original.id} />
      </Link>
    ),
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
        show
        edit
        deleteOptions={{
          gqlMutation: ProfileDeleteOneMutation,
        }}
      />
    ),
  },
]);
