import { useQuery } from '@tanstack/react-query';
import { presignStorageFile, useStorageTarget } from './storage-client';

/** A presigned URL is valid for its lifetime; refetch it a little before it ends. */
const PRESIGN_MARGIN_MS = 10_000;

/**
 * The short-lived download URL of a non-sensitive storage file (one cache entry per file,
 * shared by the file field and the floor plans); disabled without a file.
 */
export function usePresignedUrl(fileId: string | null) {
  const target = useStorageTarget();
  return useQuery({
    queryKey: ['itap', 'storage-presign', fileId],
    queryFn: () => presignStorageFile(fileId ?? '', target),
    enabled: fileId !== null,
    staleTime: (query) =>
      query.state.data
        ? Math.max(0, query.state.data.expiresAt - Date.now() - PRESIGN_MARGIN_MS)
        : 0,
  });
}
