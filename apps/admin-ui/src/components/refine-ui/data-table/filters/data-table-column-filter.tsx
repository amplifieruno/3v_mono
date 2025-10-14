import { Column } from '@tanstack/react-table';
import { UseTableReturnType } from '@refinedev/react-table';
import { DataTableColumnFilterInfo } from './types';
import { DataTableDateRangeFilter } from './data-table-date-range-filter';
import { DataTableEnumFilter } from './data-table-enum-filter';
import { DataTableNumRangeFilter } from './data-table-num-range-filter';

interface DataTableColumnFilterProps<TData, TValue> {
  info: DataTableColumnFilterInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: UseTableReturnType<any>;
  column: Column<TData, TValue>;
}

export function DataTableColumnFilter<TData = unknown, TValue = unknown>({
  info,
  table,
  column,
}: DataTableColumnFilterProps<TData, TValue>) {
  const title = column.columnDef.meta?.title || column.id;

  if (info.type === 'dateRange') {
    return (
      <DataTableDateRangeFilter
        table={table}
        column={column}
        title={title}
      />
    )
  }

  if (info.type === 'enum') {
    return (
      <DataTableEnumFilter
        column={column}
        options={info.enum ?? []}
        title={title}
      />
    )
  }

  if (info.type === 'numRange') {
    return (
      <DataTableNumRangeFilter
        table={table}
        column={column}
        title={title}
      />
    )
  }

  return null;
}
