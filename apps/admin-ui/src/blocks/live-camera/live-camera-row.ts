import { z } from 'zod';
import type { LiveCameraDevice } from './live-camera-panel';

/** A device row as the live views read it (other columns are ignored). */
const liveCameraRow = z.object({
  id: z.string(),
  name: z.string(),
  stream_url: z.string().nullable().optional(),
  recognition_enabled: z.boolean().nullable().optional(),
});

/** The camera of a device row, or `null` for anything else. */
export function liveCameraOf(row: unknown): LiveCameraDevice | null {
  const parsed = liveCameraRow.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    stream_url: parsed.data.stream_url ?? null,
    recognition_enabled: parsed.data.recognition_enabled === true,
  };
}
