import { prepareColumns } from '@/shared/lib/utils/columns';
import { IdentityDeleteOneMutation, IdentityFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { identityStatuses } from '../../data/enums';
import { ColumnDef } from '@tanstack/react-table';

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
    accessorKey: 'status',
    enableSorting: true,
    enableHiding: true,
    cell: ({ getValue }) => {
      const value = getValue<string>();
      const status = identityStatuses.find((status) => status.value === value);

      return (
        <div className='flex items-center'>
          <span>{status?.label || value}</span>
        </div>
      );
    },
    meta: {
      title: 'Status',
      filters: [
        {
          type: 'enum',
          enum: identityStatuses,
        },
      ],
    },
  },
  {
    id: 'profile',
    accessorFn: (row: IdentityFragment) => row.profile,
    enableSorting: false,
    enableHiding: true,
    cell: ({ row }) => {
      const identity = row.original as IdentityFragment;
      const profile = identity.profile;
      if (!profile) {
        return <span className='text-muted-foreground'>No profile</span>;
      }
      return (
        <div className='flex flex-col'>
          <span className='font-medium'>
            {profile.first_name} {profile.last_name}
          </span>
          <span className='text-sm text-muted-foreground'>{profile.email}</span>
        </div>
      );
    },
    meta: {
      title: 'Profile',
    },
  } as ColumnDef<IdentityFragment>,
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
