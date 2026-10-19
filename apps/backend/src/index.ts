import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const app = createApp(loadEnv());
const server = createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Socket.io server is kept for the slice-4 live recognition port; no handlers are registered yet.
const io = new Server(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} not found` });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  process.stdout.write(`Server running on port ${PORT} (CORS: ${corsOrigin})\n`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

export { io };
