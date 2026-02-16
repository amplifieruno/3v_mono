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
import { FC } from 'react';
import { Link } from 'react-router';
import { FacilityOneQuery, FacilityUpdateOneMutation } from '../../queries';
import { facilityStatuses } from '../../data/enums';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm({
    refineCoreProps: {
      meta: {
        gqlQuery: FacilityOneQuery,
        gqlMutation: FacilityUpdateOneMutation,
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

  return (
    <div>
      <div className='flex justify-between'>
        <h1 className='text-2xl font-semibold leading-none tracking-tight'>
          Edit Facility
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
            <form onSubmit={handleSubmit(onFinish)} noValidate className='mt-6'>
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

                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <Input type='text' {...register('address')} />
                </FormItem>

                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Input type='text' {...register('timezone')} />
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
                      {facilityStatuses.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

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
