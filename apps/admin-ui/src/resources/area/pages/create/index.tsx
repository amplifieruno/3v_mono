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
import { useNavigation, useResourceParams, useList } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { AreaInsertOneMutation } from '../../queries';
import { areaTypes, accessLevels, areaStatuses } from '../../data/enums';
import { AllFacilitiesQuery } from '@/resources/facility/queries';
import { AreasByFacilityQuery } from '../../queries';

export const CreatePage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm({
    defaultValues: {
      name: '',
      description: '',
      facility_id: '',
      parent_id: '',
      area_type: 'zone',
      access_level: 'public',
      capacity: '',
      status: 'active',
    },
    refineCoreProps: {
      meta: { gqlMutation: AreaInsertOneMutation },
    },
  });

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = form;

  const selectedFacilityId = watch('facility_id');

  const facilitiesResult = useList({
    resource: 'itap_facilities',
    meta: { gqlQuery: AllFacilitiesQuery },
    pagination: { mode: 'off' },
  });

  const areasResult = useList({
    resource: 'itap_areas',
    meta: { gqlQuery: AreasByFacilityQuery },
    filters: [{ field: 'facility_id', operator: 'eq', value: selectedFacilityId }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: !!selectedFacilityId },
  });

  const facilities = (facilitiesResult.result?.data ?? []) as Array<{ id: string; name: string }>;
  const existingAreas = (areasResult.result?.data ?? []) as Array<{ id: string; name: string; parent_id: string | null; area_type: string }>;

  const handleFormSubmit = handleSubmit((values) => {
    const data: Record<string, unknown> = { ...values };
    if (!data.parent_id) delete data.parent_id;
    if (!data.capacity) delete data.capacity;
    else data.capacity = Number(data.capacity);
    onFinish(data as Parameters<typeof onFinish>[0]);
  });

  return (
    <div>
      <div className='flex justify-between'>
        <h1 className='text-2xl font-semibold leading-none tracking-tight'>
          Create Area
        </h1>
        <Button variant='outline' size='sm' asChild>
          <Link to={listUrl(identifier ?? '')}>
            <ListIcon /> Back to list
          </Link>
        </Button>
      </div>
      <Card className='mt-4 max-w-[500px]'>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleFormSubmit} noValidate className='mt-6'>
              <div className='flex flex-col gap-4'>
                <FormItem>
                  <FormLabel>Facility</FormLabel>
                  <Select
                    value={watch('facility_id')}
                    onValueChange={(v) => {
                      setValue('facility_id', v);
                      setValue('parent_id', '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select facility' />
                    </SelectTrigger>
                    <SelectContent>
                      {facilities.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className='text-destructive'>
                    {(errors as Record<string, { message?: string }>)?.facility_id?.message}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Parent Area (optional)</FormLabel>
                  <Select
                    value={watch('parent_id')}
                    onValueChange={(v) => setValue('parent_id', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='None (root area)' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>None (root area)</SelectItem>
                      {existingAreas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.area_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

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

                <div className='grid grid-cols-2 gap-4'>
                  <FormItem>
                    <FormLabel>Area Type</FormLabel>
                    <Select
                      value={watch('area_type')}
                      onValueChange={(v) => setValue('area_type', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {areaTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Access Level</FormLabel>
                    <Select
                      value={watch('access_level')}
                      onValueChange={(v) => setValue('access_level', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accessLevels.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                </div>

                <div className='grid grid-cols-2 gap-4'>
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <Input
                      type='number'
                      {...register('capacity')}
                      placeholder='Optional'
                    />
                  </FormItem>

                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={watch('status')}
                      onValueChange={(v) => setValue('status', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {areaStatuses.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                </div>

                <div className='mt-4'>
                  <Button className='w-40' type='submit' disabled={isSubmitting}>
                    Create
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
