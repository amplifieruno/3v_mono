import { DataTableColumnHeader } from '@/components/refine-ui/data-table/data-table-column-header';
import { ColumnDef, ColumnFiltersState, RowData } from '@tanstack/react-table';

export type PrepareadColumns<Data = RowData, Value = unknown> = {
  columns: ColumnDef<Data, Value>[];
  columnsVisibility: Record<string, boolean>;
  columnsInitialFilter?: ColumnFiltersState;
};

export const prepareColumns = <Data extends RowData, Value = unknown>(
  rawColumns: ColumnDef<Data, Value>[]
): PrepareadColumns<Data, Value> => {
  const columns: ColumnDef<Data, Value>[] = [];
  const columnsVisibility: Record<string | number | symbol, boolean> = {};
  const columnsInitialFilter: ColumnFiltersState = [];

  rawColumns.forEach((col) => {
    if (!col.header && col.meta?.title) {
      col.header = ({ column }) => (
        <DataTableColumnHeader column={column} title={col.meta?.title ?? ''} />
      );
    }
    const key = col.id || ('accessorKey' in col && col.accessorKey) || null;
    const id = key ? String(key) : null;

    if (id && col.meta?.initialHidden) {
      columnsVisibility[id] = false;
    }
    if (id && col.meta?.initialFilter !== undefined) {
      columnsInitialFilter.push({
        id,
        value: col.meta.initialFilter,
      });
    }
    columns.push(col);
  });

  return {
    columns,
    columnsVisibility,
    columnsInitialFilter:
      columnsInitialFilter.length > 0 ? columnsInitialFilter : undefined,
  };
};
