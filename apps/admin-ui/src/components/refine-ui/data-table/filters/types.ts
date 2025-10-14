export interface DataTableEnumFilterOption {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface DataTableColumnFilterInfo {
  type: 'enum' | 'dateRange' | 'numRange' | 'gt' | 'gte' | 'lt' | 'lte';
  enum?: DataTableEnumFilterOption[];
}