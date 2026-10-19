import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { startRecognition } from './recognition/runtime.js';

const env = loadEnv();
const app = createApp(env);
const server = createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Socket.io pushes live detections (room `device:<id>`, event `detection`; see recognition/socket.ts).
const io = new Server(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });
const recognition = env.RECOGNITION_ENABLED ? startRecognition(env, io) : undefined;

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} not found` });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  process.stdout.write(`Server running on port ${PORT} (CORS: ${corsOrigin}, recognition: ${recognition ? 'on' : 'off'})\n`);
});

process.on('SIGTERM', () => {
  recognition?.stop();
  server.close(() => process.exit(0));
});

export { io };
