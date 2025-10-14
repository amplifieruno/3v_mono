import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useNavigation, useResourceParams } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { IdentityOneQuery, IdentityUpdateOneMutation } from '../../queries';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm({
    refineCoreProps: {
      meta: {
        gqlQuery: IdentityOneQuery,
        gqlMutation: IdentityUpdateOneMutation,
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
            Edit Identity
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
              <div className='flex flex-col gap-2'>
                <FormItem>
                  <FormLabel className='mr-2'>Name</FormLabel>
                  <Input
                    type='text'
                    {...register('name', {
                      required: 'Name cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.name?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>Transaction fee</FormLabel>
                  <Input
                    type='number'
                    {...register('card_transaction_client_fee', {
                      required: 'Transaction fee cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {
                      (errors as any)?.card_transaction_client_fee
                        ?.message as string
                    }
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>Minimum fee</FormLabel>
                  <Input
                    type='number'
                    {...register('minimum_fee', {
                      required: 'cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.minimum_fee?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>Exchange fee</FormLabel>
                  <Input
                    type='number'
                    {...register('exchange_fee', {
                      required: 'cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.exchange_fee?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>Daily interest rate</FormLabel>
                  <Input
                    type='number'
                    {...register('daily_interest_rate', {
                      required: 'cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.daily_interest_rate?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>USDT LTV</FormLabel>
                  <Input
                    type='number'
                    {...register('usdt_cl_coefficient', {
                      required: 'cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.usdt_cl_coefficient?.message as string}
                  </FormMessage>
                </FormItem>

                <FormItem>
                  <FormLabel className='mr-2'>EURC LTV</FormLabel>
                  <Input
                    type='number'
                    {...register('eurc_ltv', {
                      required: 'cannot be empty',
                    })}
                  />
                  <FormMessage className='text-destructive'>
                    {(errors as any)?.eurc_ltv?.message as string}
                  </FormMessage>
                </FormItem>

                {/*<div className='flex items-center pt-2 space-x-2'>*/}
                {/*  <Controller*/}
                {/*    name='is_default'*/}
                {/*    control={control}*/}
                {/*    render={({ field }) => (*/}
                {/*      <Checkbox*/}
                {/*        id='isTariffDefault'*/}
                {/*        checked={field.value}*/}
                {/*        onCheckedChange={field.onChange}*/}
                {/*      />*/}
                {/*    )}*/}
                {/*  />*/}
                {/*  <label*/}
                {/*    htmlFor='isTariffDefault'*/}
                {/*    className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'*/}
                {/*  >*/}
                {/*    Default*/}
                {/*  </label>*/}
                {/*</div>*/}
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
