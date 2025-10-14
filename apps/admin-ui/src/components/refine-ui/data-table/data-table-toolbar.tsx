import { Column, ColumnFiltersState } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTableViewOptions } from './data-table-view-options';
import { ReactNode, useMemo } from 'react';
import { DataTableColumnFilterInfo } from './filters/types';
import { DataTableColumnFilter } from './filters/data-table-column-filter';
import { UseTableReturnType } from '@refinedev/react-table';
import { BaseRecord } from '@refinedev/core';
import { isEqual } from 'lodash';
import { TimerIcon } from 'lucide-react';

interface DataTableToolbarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: UseTableReturnType<any>;
  filtersContent?: ReactNode;
  actionsContent?: ReactNode;
  initialFilters?: ColumnFiltersState;
}

export function DataTableToolbar({
  table,
  filtersContent,
  actionsContent,
  initialFilters,
}: DataTableToolbarProps) {
  const columnFilters = table.reactTable.getState().columnFilters;

  const isFiltered = useMemo(() => {
    if (!initialFilters) {
      return columnFilters.length > 0;
    }

    return !isEqual(columnFilters, initialFilters);
  }, [columnFilters, initialFilters]);

  const resetFilters = () => {
    if (initialFilters) {
      table.reactTable.setColumnFilters(initialFilters);
    } else {
      table.reactTable.resetColumnFilters(true);
    }
  };

  const filters = useMemo(() => {
    const colums = table.reactTable.getAllColumns();
    const result: Array<{
      column: Column<BaseRecord>;
      info: DataTableColumnFilterInfo;
    }> = [];

    colums.forEach((column) => {
      column.columnDef.meta?.filters?.forEach((info) => {
        result.push({
          column,
          info,
        });
      });
    });
    return result;
  }, [table]);

  return (
    <div className='flex items-center justify-between'>
      <div className='flex flex-1 items-center space-x-2'>
        {filters.map((item) => (
          <DataTableColumnFilter
            table={table}
            column={item.column}
            info={item.info}
          />
        ))}
        {filtersContent}
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={resetFilters}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <TimerIcon className='ml-2 h-4 w-4' />
          </Button>
        )}
      </div>
      <div className='flex items-center space-x-2'>
        <DataTableViewOptions table={table} />
        {actionsContent}
      </div>
    </div>
  );
}
