import type { TrustedSchema } from '@burojs/core';
import type { z } from 'zod';

/**
 * A zod schema as the Standard Schema a custom operation takes. zod 3's own
 * `~standard` is not assignable to `TrustedSchema` (its issue paths may hold
 * path segments, the type's are plain keys), so the declared shape is adapted
 * here, once.
 */
export function schema<T>(
  zodSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): TrustedSchema<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: (value) => {
        const result = zodSchema.safeParse(value);
        return result.success
          ? { value: result.data }
          : { issues: result.error.issues.map(({ message, path }) => ({ message, path })) };
      },
    },
  };
}
