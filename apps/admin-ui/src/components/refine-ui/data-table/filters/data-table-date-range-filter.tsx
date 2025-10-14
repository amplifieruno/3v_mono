import { Column } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Popover,
  // PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { UseTableReturnType } from '@refinedev/react-table';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';

interface DataTableDateRangeFilterProps<TData, TValue> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: UseTableReturnType<any>;
  column: Column<TData, TValue>;
  title?: string;
}

export function DataTableDateRangeFilter<TData, TValue>({
  table,
  column,
  title,
}: DataTableDateRangeFilterProps<TData, TValue>) {
  const onSelect = (value: DateRange | undefined) => {
    table.refineCore.setFilters(
      [
        {
          field: column?.id,
          operator: 'gte',
          value: value?.from?.toISOString(),
        },
        {
          field: column?.id,
          operator: 'lte',
          value: value?.to?.toISOString(),
        },
      ],
      'merge'
    );
  };

  const value = table.refineCore.filters.reduce(
    (acc: DateRange | undefined, item): DateRange | undefined => {
      if (item.operator === 'gte' && item.field === column?.id && item.value) {
        if (acc) {
          acc.from = new Date(item.value);
          return acc;
        }
        return {
          from: new Date(item.value),
        };
      }
      if (item.operator === 'lte' && item.field === column?.id && item.value) {
        if (acc) {
          acc.to = new Date(item.value);
          return acc;
        }
        return {
          from: undefined,
          to: new Date(item.value),
        };
      }
      return acc;
    },
    undefined
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 border-dashed'>
          <CalendarIcon className='mr-2 h-4 w-4' />
          {value?.from ? (
            <>
              {title && <span className='mr-2'>{title}:</span>}
              {value.to ? (
                <>
                  {format(value.from, 'LLL dd, y')} -{' '}
                  {format(value.to, 'LLL dd, y')}
                </>
              ) : (
                format(value.from, 'LLL dd, y')
              )}
            </>
          ) : (
            <span>{title || 'Pick a date'}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          initialFocus
          mode='range'
          defaultMonth={value?.from}
          selected={value}
          onSelect={onSelect}
          numberOfMonths={2}
        />
        {value ? (
          <div className='px-4 pb-2'>
            {/* <PopoverClose asChild>
              <Button
                size={'sm'}
                onClick={() => onSelect(undefined)}
                variant={'ghost'}
                className='w-full'
              >
                Clear
              </Button>
            </PopoverClose> */}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
