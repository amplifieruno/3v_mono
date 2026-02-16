import { ResourceProps } from '@refinedev/core';
import { TagsIcon } from 'lucide-react';

export const segmentConfig: ResourceProps = {
  name: 'itap_segments',
  list: '/segments',
  create: '/segments/create',
  edit: '/segments/edit/:id',
  show: '/segments/show/:id',
  meta: {
    label: 'Segments',
    icon: <TagsIcon />,
    canDelete: true,
  },
};
