import { ResourceProps } from '@refinedev/core';
import { CameraIcon } from 'lucide-react';

export const deviceConfig: ResourceProps = {
  name: 'itap_devices',
  list: '/devices',
  create: '/devices/create',
  edit: '/devices/edit/:id',
  show: '/devices/show/:id',
  meta: {
    label: 'Devices',
    icon: <CameraIcon />,
    canDelete: true,
  },
};
