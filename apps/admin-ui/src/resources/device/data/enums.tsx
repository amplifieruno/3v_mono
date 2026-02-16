export const deviceTypes = [
  { value: 'static_video_camera', label: 'Static Camera' },
  { value: 'ptz_camera', label: 'PTZ Camera' },
  { value: 'sensor', label: 'Sensor' },
];

export const deviceStatuses = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'error', label: 'Error' },
  { value: 'maintenance', label: 'Maintenance' },
];

export const healthStatuses = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
  { value: 'unknown', label: 'Unknown' },
];

export const deviceStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'default';
    case 'inactive':
      return 'secondary';
    case 'error':
      return 'destructive';
    case 'maintenance':
      return 'outline';
    default:
      return 'secondary';
  }
};

export const healthStatusColor = (status: string) => {
  switch (status) {
    case 'healthy':
      return 'default';
    case 'warning':
      return 'outline';
    case 'critical':
      return 'destructive';
    case 'unknown':
      return 'secondary';
    default:
      return 'secondary';
  }
};
