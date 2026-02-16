import { useTable } from '@refinedev/react-table';
import { FC } from 'react';
import { columnsInfo } from './columns';
import { SegmentListQuery } from '../../queries';
import { DataTable } from '@/components/refine-ui/data-table/data-table';
import { useFixTableBehaviour } from '@/shared/lib/utils/useFixTableBehaviour';
import { DataTableToolbar } from '@/components/refine-ui/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useNavigation } from '@refinedev/core';
import { PlusCircleIcon } from 'lucide-react';

export const ListPage: FC = () => {
  const { create } = useNavigation();
  const table = useTable({
    columns: columnsInfo.columns,
    initialState: {
      columnVisibility: columnsInfo.columnsVisibility,
    },
    refineCoreProps: {
      meta: { gqlQuery: SegmentListQuery },
    },
  });

  useFixTableBehaviour(table, columnsInfo);

  return (
    <DataTable
      table={table}
      toolbar={
        <DataTableToolbar
          table={table}
          actionsContent={
            <Button
              onClick={() => create('itap_segments')}
              variant='outline'
              size='sm'
            >
              <PlusCircleIcon className='mr-2 h-4 w-4' />
              Create
            </Button>
          }
        />
      }
    />
  );
};
