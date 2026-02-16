import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useNavigation, useResourceParams } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SegmentOneQuery, SegmentUpdateOneMutation } from '../../queries';
import { segmentStatuses } from '../../data/enums';
import { ColorPicker } from '../../components/ColorPicker';
import { RuleBuilder } from '../../components/RuleBuilder';
import { RuleGroup, createEmptyGroup } from '../../lib/conditionsToWhere';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();
  const [conditions, setConditions] = useState<RuleGroup>(createEmptyGroup());
  const [conditionsLoaded, setConditionsLoaded] = useState(false);

  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm({
    refineCoreProps: {
      meta: {
        gqlQuery: SegmentOneQuery,
        gqlMutation: SegmentUpdateOneMutation,
      },
    },
  });

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = form;

  const segmentType = watch('segment_type');

  // Load conditions from fetched data
  useEffect(() => {
    if (query?.data?.data && !conditionsLoaded) {
      const record = query.data.data as Record<string, unknown>;
      const savedConditions = record.conditions as RuleGroup | undefined;
      if (savedConditions?.rules) {
        setConditions(savedConditions);
      }
      setConditionsLoaded(true);
    }
  }, [query?.data?.data, conditionsLoaded]);

  const handleFormSubmit = handleSubmit((values) => {
    const data: Record<string, unknown> = { ...values };
    if (segmentType === 'rule_based') {
      data.conditions = conditions;
    } else {
      data.conditions = {};
    }
    onFinish(data as Parameters<typeof onFinish>[0]);
  });

  return (
    <div>
      <div className='flex justify-between'>
        <h1 className='text-2xl font-semibold leading-none tracking-tight'>
          Edit Segment
        </h1>
        <Button variant='outline' size='sm' asChild>
          <Link to={listUrl(identifier ?? '')}>
            <ListIcon /> Back to list
          </Link>
        </Button>
      </div>
      <Card className='mt-4 max-w-[700px]'>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleFormSubmit} noValidate className='mt-6'>
              <div className='flex flex-col gap-4'>
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <Input
                    type='text'
                    {...register('name', { required: 'Name is required' })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as Record<string, { message?: string }>)?.name?.message}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <Textarea {...register('description')} />
                </FormItem>

                <ColorPicker
                  value={watch('color') ?? '#6366f1'}
                  onChange={(c) => setValue('color', c)}
                />

                <div className='grid grid-cols-2 gap-4'>
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={segmentType ?? 'manual'}
                      onValueChange={(v) => setValue('segment_type', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='manual'>Manual</SelectItem>
                        <SelectItem value='rule_based'>Rule-based</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={watch('status') ?? 'active'}
                      onValueChange={(v) => setValue('status', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {segmentStatuses.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                </div>

                {segmentType === 'rule_based' && (
                  <RuleBuilder value={conditions} onChange={setConditions} />
                )}

                <div className='mt-4'>
                  <Button className='w-40' type='submit' disabled={isSubmitting}>
                    Save
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};
