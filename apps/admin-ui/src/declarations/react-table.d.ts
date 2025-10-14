import { DataTableColumnFilterInfo } from '@/shared/components/DataTable/filters/types';
import '@tanstack/react-table';
import { RowData } from '@tanstack/react-table';
import { ReactNode } from 'react';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    initialHidden?: boolean;
    filters?: DataTableColumnFilterInfo[];
    actions?: ReactNode[];
    initialFilter?: unknown;

    // Refine
    filterKey?: string;
    filterOperator?: string;
  }
}
