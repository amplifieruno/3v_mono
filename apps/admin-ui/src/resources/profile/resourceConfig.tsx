import { ResourceProps } from '@refinedev/core';
import { UserIcon } from 'lucide-react';

export const profileConfig: ResourceProps = {
  name: 'itap_profiles',
  list: '/profiles',
  create: '/profiles/create',
  edit: '/profiles/edit/:id',
  show: '/profiles/show/:id',
  meta: {
    label: 'Profiles',
    icon: <UserIcon />,
    canDelete: true,
  },
};
