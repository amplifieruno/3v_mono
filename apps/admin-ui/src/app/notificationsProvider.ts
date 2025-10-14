import { NotificationProvider } from '@refinedev/core';
import { toast } from 'sonner';

export const notificationProvider: NotificationProvider = {
  open: ({ message, key, type, description }) => {
    let fn = toast.info;
    if (type === 'success') {
      fn = toast.success;
    } else if (type === 'error') {
      fn = toast.error;
    }
    fn(message, {
      id: key,
      description,
    });
  },
  close() {
    // pass
  },
};
