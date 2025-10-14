import { prepareColumns } from '@/shared/lib/utils/columns';
import { IdentityDeleteOneMutation, IdentityFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { identityStatuses } from '../../data/enums';
import { ColumnDef } from '@tanstack/react-table';
import { User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Component for displaying identity images using Avatar
const IdentityImages = ({ images }: { images: string[] }) => {
  const displayImages = images.slice(0, 3); // Show max 3 images
  const remainingCount = images.length - displayImages.length;

  if (!images || images.length === 0) {
    return (
      <Avatar>
        <AvatarFallback>
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div className="flex -space-x-2" title={`${images.length} image(s) total`}>
      {displayImages.map((imageUrl, index) => (
        <Avatar
          key={index}
          className="ring-2 ring-background hover:z-10 transition-all hover:scale-110 cursor-pointer"
          title={`Image ${index + 1}`}
        >
          <AvatarImage
            src={imageUrl}
            alt={`Identity image ${index + 1}`}
            className="object-cover"
          />
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      ))}
      {remainingCount > 0 && (
        <Avatar className="ring-2 ring-background hover:z-10 transition-all hover:scale-110 cursor-pointer">
          <AvatarFallback className="text-xs font-medium" title={`${remainingCount} more image(s)`}>
            +{remainingCount}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

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
    id: 'images',
    accessorFn: (row: IdentityFragment) => row.images,
    enableSorting: false,
    enableHiding: true,
    cell: ({ row }) => {
      const identity = row.original as IdentityFragment;
      return <IdentityImages images={identity.images || []} />;
    },
    meta: {
      title: 'Images',
    },
  } as ColumnDef<IdentityFragment>,
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
