import { ResourceProps } from '@refinedev/core';
import { MapPinIcon } from 'lucide-react';

export const areaConfig: ResourceProps = {
  name: 'itap_areas',
  list: '/areas',
  create: '/areas/create',
  edit: '/areas/edit/:id',
  meta: {
    label: 'Areas',
    icon: <MapPinIcon />,
    canDelete: true,
  },
};
