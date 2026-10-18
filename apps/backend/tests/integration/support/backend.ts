/**
 * Hasura Actions call the compose `backend` service (BACKEND_URL=http://backend:3001), which runs the
 * mounted source with `tsx watch`, so action tests exercise the current code. This only checks that the
 * service is up (published on 127.0.0.1:${BACKEND_PORT:-3001}) and fails fast with a clear message.
 */
export async function requireBackend(): Promise<void> {
  const url = `http://localhost:${process.env.BACKEND_PORT ?? 3001}/health`;
  const ok = await fetch(url, { signal: AbortSignal.timeout(3000) }).then(
    (res) => res.ok,
    () => false,
  );
  if (!ok) {
    throw new Error(
      `Backend not reachable at ${url}. Start the compose backend service: \`make dev-compose\` ` +
        '(docker compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d backend).',
    );
  }
}
