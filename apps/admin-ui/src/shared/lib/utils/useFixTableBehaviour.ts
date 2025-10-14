import { UseTableReturnType } from "@refinedev/react-table";
import { useEffectOnce } from "react-use";
import { HttpError } from "@refinedev/core";
import { PrepareadColumns } from "./columns";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useFixTableBehaviour = (table: UseTableReturnType<any, HttpError>, columns: PrepareadColumns<any, any>) => {
  useEffectOnce(() => {
    if (columns.columnsInitialFilter) {
      const columnFilters = table.reactTable.getState().columnFilters;
      if (columnFilters.length === 0) {
        table.reactTable.setColumnFilters(columns.columnsInitialFilter);
      } else {
        columns.columnsInitialFilter.forEach((filter) => {
          const columnFilter = columnFilters.find((f) => f.id === filter.id);
          if (!columnFilter) {
            columnFilters.push(filter);
          }
        });
        table.reactTable.setColumnFilters(columnFilters);
      }
    }
  });
}