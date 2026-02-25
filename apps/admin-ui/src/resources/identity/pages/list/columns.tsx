import { prepareColumns } from '@/shared/lib/utils/columns';
import { IdentityDeleteOneMutation, IdentityFragment } from '../../queries';
import { DataTableRowActions } from '@/components/refine-ui/data-table/data-table-row-actions';
import { UuidView } from '@/shared/components/uuid-view/uuid-view';
import { identityStatuses } from '../../data/enums';
import { ColumnDef } from '@tanstack/react-table';
import { User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Link } from 'react-router';

// Component for displaying identity images using Avatar
const IdentityImages = ({ images, id }: { images: string[]; id: string }) => {
  const displayImages = images.slice(0, 3); // Show max 3 images
  const remainingCount = images.length - displayImages.length;

  if (!images || images.length === 0) {
    return (
      <Link to={`/identities/show/${id}`}>
        <Avatar>
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </Link>
    );
  }

  return (
    <Link to={`/identities/show/${id}`} className="flex -space-x-2" title={`${images.length} image(s) total`}>
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
    </Link>
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
    cell: ({ row }) => (
      <Link
        to={`/identities/show/${row.original.id}`}
        className='text-primary hover:underline'
      >
        <UuidView value={row.original.id} />
      </Link>
    ),
  },
  {
    id: 'images',
    accessorFn: (row: IdentityFragment) => row.images,
    enableSorting: false,
    enableHiding: true,
    cell: ({ row }) => {
      const identity = row.original as IdentityFragment;
      return <IdentityImages images={identity.images || []} id={identity.id} />;
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
        <Link
          to={`/profiles/show/${profile.id}`}
          className='hover:underline'
        >
          <div className='flex flex-col'>
            <span className='font-medium text-primary'>
              {profile.first_name} {profile.last_name}
            </span>
            <span className='text-sm text-muted-foreground'>{profile.email}</span>
          </div>
        </Link>
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
        show
        edit
        deleteOptions={{
          gqlMutation: IdentityDeleteOneMutation,
        }}
      />
    ),
  },
]);
