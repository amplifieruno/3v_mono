import type { Server } from 'node:http';
import { createApp } from '../../../src/app.js';
import { testEnv } from './clients.js';

export type RunningBackend = { port: number; close(): Promise<void> };

/**
 * Starts the backend app in-process on the FIXED port Hasura reaches via BACKEND_URL
 * (env BACKEND_PORT, default 3001). Fails fast if the port is taken (e.g. `pnpm dev` is running).
 */
export async function startBackend(): Promise<RunningBackend> {
  const port = Number(process.env.BACKEND_PORT ?? 3001);
  const app = createApp(testEnv());
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(port);
    s.once('listening', () => resolve(s));
    s.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is in use. Stop the running backend (pnpm dev) or set BACKEND_PORT to the port ` +
                'Hasura reaches via BACKEND_URL.',
            )
          : error,
      );
    });
  });
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
