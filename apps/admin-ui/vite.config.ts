import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Dev endpoints go through this proxy so the console talks to one origin:
 * Hasura GraphQL (with websockets), Nhost auth and storage (prefix stripped),
 * and the backend's Socket.io.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/v1/graphql': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:4100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auth/, ''),
      },
      '/storage': {
        target: 'http://local.storage.local.nhost.run',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/storage/, ''),
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: { port: 4173, strictPort: true },
});
