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
import { useList, useNavigation, useResourceParams } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC } from 'react';
import { Controller } from 'react-hook-form';
import { Link } from 'react-router';
import { identityStatuses } from '../../data/enums';
import { IdentityInsertOneMutation } from '../../queries';
import { ProfileListQuery } from '@/resources/profile/queries';

export const CreatePage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const form = useForm({
    refineCoreProps: {
      meta: {
        gqlMutation: IdentityInsertOneMutation,
      },
    },
    defaultValues: {
      status: 'unverified',
      images: [] as string[],
      attributes: {},
      profile_id: null as string | null,
    },
  });

  const {
    refineCore: { onFinish },
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = form;

  // Fetch profiles for selector
  const profilesQuery = useList({
    resource: 'itap_profiles',
    meta: {
      gqlQuery: ProfileListQuery,
    },
    pagination: {
      pageSize: 100,
    },
  });

  return (
    <div>
      <div className='flex justify-between'>
        <div className='flex justify-between items-center gap-2'>
          <h1 className='text-2xl font-semibold leading-none tracking-tight'>
            Create Identity
          </h1>
        </div>
        <div>
          <Button variant='outline' size='sm' asChild>
            <Link to={listUrl(identifier ?? '')}>
              <ListIcon />
              Back to list
            </Link>
          </Button>
        </div>
      </div>
      <Card className='mt-4 max-w-[600px]'>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSubmit(onFinish)} noValidate className='mt-6'>
              <div className='flex flex-col gap-4'>
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Controller
                    name='status'
                    control={control}
                    rules={{ required: 'Status is required' }}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select status' />
                        </SelectTrigger>
                        <SelectContent>
                          {identityStatuses.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormMessage className='text-destructive'>
                    {errors?.status?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Profile (optional)</FormLabel>
                  <Controller
                    name='profile_id'
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value === '__none__' ? null : value);
                        }}
                        value={field.value || '__none__'}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select profile or leave empty' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='__none__'>No profile</SelectItem>
                          {profilesQuery?.query?.data?.data?.map((profile: any) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.first_name} {profile.last_name}
                              {profile.email && ` (${profile.email})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormMessage className='text-destructive'>
                    {errors?.profile_id?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Image URLs (comma-separated)</FormLabel>
                  <Input
                    type='text'
                    placeholder='https://example.com/image1.jpg, https://example.com/image2.jpg'
                    {...register('images', {
                      required: 'At least one image URL is required',
                      setValueAs: (value: string) => {
                        if (!value) return [];
                        return value
                          .split(',')
                          .map((url) => url.trim())
                          .filter((url) => url.length > 0);
                      },
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {errors?.images?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Attributes (JSON)</FormLabel>
                  <Input
                    type='text'
                    placeholder='{}'
                    {...register('attributes', {
                      required: 'Attributes are required (use {} for empty)',
                      setValueAs: (value: string) => {
                        try {
                          return value ? JSON.parse(value) : {};
                        } catch {
                          return {};
                        }
                      },
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {errors?.attributes?.message as string}
                  </FormMessage>
                </FormItem>

                <div className='mt-4'>
                  <Button
                    className='w-40'
                    type='submit'
                    disabled={isSubmitting}
                  >
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
