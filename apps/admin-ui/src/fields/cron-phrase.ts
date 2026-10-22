import { useT } from '@burojs/react';
import type { CronPhrase } from './cron-format';

/** The cron summary's phrases through the bundle (`console.cron.*`, English defaults in `CRON_PHRASES`). */
export function useCronPhrase(): CronPhrase {
  const t = useT();
  return (key, params) => t(`console.cron.${key}`, params === undefined ? undefined : { params });
}
