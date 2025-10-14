import { useLogin } from '@refinedev/core';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FC, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { LogoIcon } from '@/shared/components/logo/logo-icon';

export const Login: FC = () => {
  const { mutate } = useLogin();
  const { control, handleSubmit } = useForm();

  const submit = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (formData: any) => {
      mutate(formData);
    },
    [mutate]
  );

  return (
    <div className='themes-wrapper bg-background w-full h-screen flex flex-col items-center justify-center px-4'>
      <div className='flex flex-col items-center justify-center gap-2 mb-4'>
        <LogoIcon className='w-12 h-12' />
        <div className='text-lg font-semibold'>Identity Tracking and Access Platform</div>
      </div>
      <Card className='mx-auto w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-2xl'>Login</CardTitle>
          <CardDescription>
            Enter your username below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)}>
            <div className='grid gap-4'>
              <div className='grid gap-2'>
                <Label>Email</Label>
                <Controller
                  control={control}
                  name='email'
                  render={({ field }) => <Input required {...field} />}
                />
              </div>
              <div className='grid gap-2'>
                <Label>Password</Label>
                <Controller
                  control={control}
                  name='password'
                  render={({ field }) => (
                    <Input type='password' required {...field} />
                  )}
                />
              </div>
              <Button type='submit' className='w-full'>
                Login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
