import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useNavigation, useResourceParams } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon, Camera } from 'lucide-react';
import { FC, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { FaceScannerModal } from '@/domains/face-scanner';
import { ProfileOneQuery, ProfileUpdateOneMutation } from '../../queries';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();
  const { toast } = useToast();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const handleFaceIdComplete = async (files: File[]) => {
    setUploading(true);
    try {
      // Upload each file to backend with skipSimilarityCheck=true
      // This ensures all 5 face angles are captured as separate identities
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(
          `/api/face/detect?profileId=${identifier}&skipSimilarityCheck=true`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        return response.json();
      });

      const results = await Promise.all(uploadPromises);
      const totalIdentities = results.reduce(
        (sum, r) => sum + (r.identities?.length || 0),
        0
      );

      toast({
        title: 'Success',
        description: `Face ID created successfully. ${totalIdentities} identities linked to profile.`,
      });

      setScannerOpen(false);
    } catch (error) {
      console.error('Failed to create Face ID:', error);
      toast({
        title: 'Error',
        description: 'Failed to create Face ID. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

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
                    type='button'
                    variant='outline'
                    onClick={() => setScannerOpen(true)}
                    disabled={uploading}
                    className='w-full'
                  >
                    <Camera className='mr-2 h-4 w-4' />
                    {uploading ? 'Uploading...' : 'Create Face ID'}
                  </Button>
                </div>

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

      <FaceScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onComplete={handleFaceIdComplete}
        profileId={identifier}
      />
    </div>
  );
};
