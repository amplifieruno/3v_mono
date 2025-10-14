import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useNavigation, useResourceParams } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { ProfileOneQuery, ProfileUpdateOneMutation } from '../../queries';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm({
    refineCoreProps: {
      meta: {
        gqlQuery: ProfileOneQuery,
        gqlMutation: ProfileUpdateOneMutation,
      },
    },
  });

  const {
    formState: { isSubmitting, errors },
    handleSubmit,
    register,
  } = form;

  return (
    <div>
      <div className='flex justify-between'>
        <div className='flex justify-between items-center gap-2'>
          <h1 className='text-2xl font-semibold leading-none tracking-tight'>
            Edit Profile
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
      <Card className='mt-4 max-w-[400px]'>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSubmit(onFinish)} noValidate className='mt-6'>
              <div className='flex flex-col gap-4'>
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <Input
                    type='text'
                    {...register('first_name', {
                      required: 'First name is required',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.first_name?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <Input
                    type='text'
                    {...register('last_name', {
                      required: 'Last name is required',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.last_name?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type='email'
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address',
                      },
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.email?.message as string}
                  </FormMessage>
                </FormItem>

                <div className='mt-4'>
                  <Button
                    className='w-40'
                    type='submit'
                    disabled={isSubmitting}
                  >
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
