import { ResourceProps } from '@refinedev/core';
import { ScanFaceIcon } from 'lucide-react';

export const identityConfig: ResourceProps = {
  name: 'itap_identities',
  list: '/identities',
  create: '/identities/create',
  edit: '/identities/edit/:id',
  show: '/identities/show/:id',
  meta: {
    label: 'Identities',
    icon: <ScanFaceIcon />,
    canDelete: false,
  },
};
