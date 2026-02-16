import { ResourceProps } from '@refinedev/core';
import { Building2Icon } from 'lucide-react';

export const facilityConfig: ResourceProps = {
  name: 'itap_facilities',
  list: '/facilities',
  create: '/facilities/create',
  edit: '/facilities/edit/:id',
  show: '/facilities/show/:id',
  meta: {
    label: 'Facilities',
    icon: <Building2Icon />,
    canDelete: true,
  },
};
