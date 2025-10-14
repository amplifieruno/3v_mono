import { Column } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Popover,
  // PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { UseTableReturnType } from '@refinedev/react-table';
import { BinaryIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DataTableNumRangeFilterProps<TData, TValue> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: UseTableReturnType<any>;
  column: Column<TData, TValue>;
  title?: string;
}

type Range = [number | string | undefined, number | string | undefined];

export function DataTableNumRangeFilter<TData, TValue>({
  table,
  column,
  title,
}: DataTableNumRangeFilterProps<TData, TValue>) {
  const onChange = (
    operator: 'gte' | 'lte',
    e?: React.ChangeEvent<HTMLInputElement>
  ) => {
    table.refineCore.setFilters(
      [
        {
          field: column?.id,
          operator,
          value: e?.currentTarget.value || undefined,
        },
      ],
      'merge'
    );
  };

  const clear = () => {
    table.refineCore.setFilters(
      [
        {
          field: column?.id,
          operator: 'gte',
          value: undefined,
        },
        {
          field: column?.id,
          operator: 'lte',
          value: undefined,
        },
      ],
      'merge'
    );
  };

  const value = table.refineCore.filters.reduce(
    (acc: Range, item): Range => {
      if (item.operator === 'gte' && item.field === column?.id) {
        acc[0] = item.value;
      }
      if (item.operator === 'lte' && item.field === column?.id) {
        acc[1] = item.value;
      }
      return acc;
    },
    [undefined, undefined] as Range
  );

  let valueStr = '';
  if (value[0] !== undefined || value[1] !== undefined) {
    if (value[0] === undefined) {
      valueStr = `<= ${value[1]}`;
    } else if (value[1] === undefined) {
      valueStr = `>= ${value[0]}`;
    } else {
      valueStr = `${value[0]} - ${value[1]}`;
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 border-dashed'>
          <BinaryIcon className='mr-2 h-4 w-4' />
          {valueStr ? (
            <>
              {title && <span className='mr-2'>{title}:</span>}
              {valueStr}
            </>
          ) : (
            <span>{title || 'Pick a range'}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto' align='start'>
        <div className='flex flex-row gap-2 items-center'>
          <Input
            value={value[0]}
            onChange={(e) => onChange('gte', e)}
            type='number'
            className='h-8 w-[100px]'
            placeholder='From'
          />{' '}
          -{' '}
          <Input
            value={value[1]}
            onChange={(e) => onChange('lte', e)}
            type='number'
            className='h-8 w-[100px]'
            placeholder='To'
          />
        </div>
        {/* {valueStr ? (
          <PopoverClose asChild>
            <Button
              size={'sm'}
              onClick={clear}
              className='w-full mt-4'
              variant={'ghost'}
            >
              Clear
            </Button>
          </PopoverClose>
        ) : null} */}
      </PopoverContent>
    </Popover>
  );
}
