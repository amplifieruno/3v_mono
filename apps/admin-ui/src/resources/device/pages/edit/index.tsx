import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useNavigation, useResourceParams, useList } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ListIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { DeviceOneQuery, DeviceUpdateOneMutation, AreasWithFacilityQuery } from '../../queries';
import { deviceTypes, deviceStatuses } from '../../data/enums';

export const EditPage: FC = () => {
  const { identifier } = useResourceParams();
  const { listUrl } = useNavigation();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm({
    refineCoreProps: {
      meta: {
        gqlQuery: DeviceOneQuery,
        gqlMutation: DeviceUpdateOneMutation,
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

  const areasResult = useList({
    resource: 'itap_areas',
    meta: { gqlQuery: AreasWithFacilityQuery },
    pagination: { mode: 'off' },
  });

  const areas = (areasResult.result?.data ?? []) as Array<{
    id: string;
    name: string;
    facility: { id: string; name: string } | null;
  }>;

  const areasByFacility = areas.reduce<Record<string, { facilityName: string; areas: typeof areas }>>((acc, area) => {
    const facilityName = area.facility?.name ?? 'No Facility';
    const facilityId = area.facility?.id ?? '__none__';
    if (!acc[facilityId]) {
      acc[facilityId] = { facilityName, areas: [] };
    }
    acc[facilityId].areas.push(area);
    return acc;
  }, {});

  const handleFormSubmit = (values: Record<string, unknown>) => {
    const data = { ...values };
    if (!data.area_id) data.area_id = null;
    if (!data.stream_url) data.stream_url = null;
    if (!data.resolution) data.resolution = null;
    if (data.fps) data.fps = Number(data.fps);
    else data.fps = null;
    if (data.credentials && typeof data.credentials === 'string') {
      try {
        data.credentials = JSON.parse(data.credentials);
      } catch {
        delete data.credentials;
      }
    }
    if (data.configuration && typeof data.configuration === 'string') {
      try {
        data.configuration = JSON.parse(data.configuration);
      } catch {
        delete data.configuration;
      }
    }
    onFinish(data);
  };

  return (
    <div>
      <div className='flex justify-between'>
        <h1 className='text-2xl font-semibold leading-none tracking-tight'>
          Edit Device
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
            <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className='mt-6'>
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

                <div className='grid grid-cols-2 gap-4'>
                  <FormItem>
                    <FormLabel>Device Type</FormLabel>
                    <Select
                      value={watch('device_type') ?? 'static_video_camera'}
                      onValueChange={(v) => setValue('device_type', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {deviceTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
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
                        {deviceStatuses.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                </div>

                <FormItem>
                  <FormLabel>Area</FormLabel>
                  <Select
                    value={watch('area_id') ?? ''}
                    onValueChange={(v) => setValue('area_id', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select area' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>No area</SelectItem>
                      {Object.entries(areasByFacility).map(([facilityId, group]) => (
                        <SelectGroup key={facilityId}>
                          <SelectLabel>{group.facilityName}</SelectLabel>
                          {group.areas.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

                <FormItem>
                  <FormLabel>Stream URL</FormLabel>
                  <Input
                    type='text'
                    {...register('stream_url')}
                    placeholder='rtsp://hostname:8554/stream-name'
                  />
                </FormItem>

                <div className='grid grid-cols-2 gap-4'>
                  <FormItem>
                    <FormLabel>Resolution</FormLabel>
                    <Input
                      type='text'
                      {...register('resolution')}
                      placeholder='1920x1080'
                    />
                  </FormItem>

                  <FormItem>
                    <FormLabel>FPS</FormLabel>
                    <Input
                      type='number'
                      {...register('fps')}
                      placeholder='25'
                    />
                  </FormItem>
                </div>

                <FormItem>
                  <FormLabel>Credentials (JSON, optional)</FormLabel>
                  <Textarea
                    {...register('credentials')}
                    placeholder='{"username": "admin", "password": "..."}'
                    className='font-mono text-sm'
                    rows={3}
                  />
                </FormItem>

                <FormItem>
                  <FormLabel>Configuration (JSON, optional)</FormLabel>
                  <Textarea
                    {...register('configuration')}
                    placeholder='{"key": "value"}'
                    className='font-mono text-sm'
                    rows={3}
                  />
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
