import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
queryClient.getMutationCache().subscribe((event: any) => {
  console.log('getMutationCache', event);
  if (event.type === 'updated' && event.action.type === 'success') {
    if (event.mutation.meta && 'invalidateQueries' in event.mutation.meta) {
      if (Array.isArray(event.mutation.meta.invalidateQueries)) {
        event.mutation.meta.invalidateQueries.forEach((keys: string[][]) =>
          queryClient.invalidateQueries({
            queryKey: keys,
          })
        );
      }
    }
  }
});
