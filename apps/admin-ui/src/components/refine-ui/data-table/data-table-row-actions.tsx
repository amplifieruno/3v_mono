import { Row } from '@tanstack/react-table';

import { ReactNode } from 'react';
import { useNavigation, useResourceParams } from '@refinedev/core';
import { Link } from 'react-router';
import { EyeIcon, MenuIcon, PencilIcon } from 'lucide-react';
import { DeleteButton } from '../buttons/delete';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  resource?: string;
  actions?: ReactNode[];
  recordId?: string | number;
  show?: boolean;
  edit?: boolean;
  deleteOptions?: {
    gqlMutation: any;
  };
}

export function DataTableRowActions<TData>({
  row,
  resource: resourceProp,
  recordId,
  show,
  edit,
  actions,
  deleteOptions,
}: DataTableRowActionsProps<TData>) {
  const { identifier } = useResourceParams();
  const { showUrl, editUrl } = useNavigation();

  const resource = resourceProp || identifier;

  return (
    <div className='flex gap-2 items-center justify-end'>
      {show && (
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          asChild
        >
          <Link to={showUrl(resource ?? '', recordId ?? '')}>
            <EyeIcon className='h-4 w-4' />
            <span className='sr-only'>Show</span>
          </Link>
        </Button>
      )}
      {edit && (
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          asChild
        >
          <Link to={editUrl(resource ?? '', recordId ?? '')}>
            <PencilIcon className='h-4 w-4' />
            <span className='sr-only'>Edit</span>
          </Link>
        </Button>
      )}
      {deleteOptions ? (
        <DeleteButton
          recordItemId={recordId}
          resource={resource}
          meta={deleteOptions}
          // invalidates={['all']}
        />
      ) : null}
      {actions?.length && actions?.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
            >
              <MenuIcon className='h-4 w-4' />
              <span className='sr-only'>Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-[160px]'>
            {actions?.map((item) => (
              <DropdownMenuItem asChild>{item}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
