# ITAP - Identity Tracking and Access Platform

A comprehensive face recognition and identity tracking platform built for market validation. This MVP demonstrates the core functionality using open-source face recognition solutions before developing custom models.

## 🚀 Features

- **Identity Management**: Register and manage individuals with face recognition
- **Real-time Tracking**: Live monitoring of identity movements across facilities
- **Device Management**: Configure and monitor camera devices and sensors
- **Facility Hierarchy**: Organize locations with hierarchical area structures
- **Analytics Dashboard**: Visual insights into identity patterns and facility usage
- **Face Recognition API**: Integration endpoints for third-party applications

## 🏗️ Architecture

This is a monorepo built with modern technologies:

### Frontend
- **React 18** with TypeScript and Vite
- **TailwindCSS v4** for styling
- **shadcn/ui** components
- **React Query** for server state
- **Zustand** for client state
- **Socket.io** for real-time updates

### Backend
- **Node.js 20+** with Express and TypeScript
- **PostgreSQL** with TypeORM
- **Redis** for caching and sessions
- **Socket.io** for real-time communication
- **CompreFace** for face recognition

### Infrastructure
- **Docker Compose** for local development
- **pnpm** workspaces for package management
- **MinIO** for S3-compatible file storage
- **nginx** for production reverse proxy

## 📋 Prerequisites

- **Node.js 20+** (use `.nvmrc` for version management)
- **pnpm 9+** (package manager)
- **Docker & Docker Compose** (for infrastructure services)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd 3v_mono

# Install dependencies
pnpm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Update .env with your configurations
# Default values work for local development
```

### 3. Start Infrastructure Services

```bash
# Start PostgreSQL, Redis, MinIO, and CompreFace
pnpm docker:dev

# Wait for services to initialize (1-2 minutes)
# CompreFace may take longer on first startup
```

### 4. Database Setup

```bash
# Run database migrations
pnpm db:migrate

# Seed with initial data (optional)
pnpm db:seed
```

### 5. Start Development Servers

```bash
# Start all development servers
pnpm dev

# Or start individually:
pnpm dev:backend   # Backend API on :3001
pnpm dev:frontend  # Frontend on :5173
```

### 6. Access the Application

- **Frontend Dashboard**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **CompreFace Admin**: http://localhost:8080
- **MinIO Console**: http://localhost:9001

**Default login credentials**: 
- Email: `admin@itap.com`
- Password: `admin123`

## 🐳 Docker Services

The development environment includes these services:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Main database |
| Redis | 6379 | Cache and sessions |
| MinIO | 9000/9001 | File storage |
| CompreFace Admin | 8080 | Face recognition admin |
| CompreFace API | 8081 | Face recognition API |
| CompreFace UI | 8082 | Face recognition interface |

## 📁 Project Structure

```
3v_mono/
├── apps/
│   ├── frontend/          # React dashboard application
│   ├── backend/           # Express API server
│   └── face-service/      # Face recognition microservice
├── packages/
│   ├── shared/           # Shared types and utilities
│   └── database/         # Database schemas and migrations
├── docker/               # Docker configurations
├── docs/                 # Project documentation
└── scripts/              # Build and deployment scripts
```

## 🔧 Development Commands

```bash
# Package management
pnpm install              # Install all dependencies
pnpm build                # Build all packages
pnpm clean                # Clean all build artifacts

# Development
pnpm dev                  # Start all dev servers
pnpm dev:backend          # Start backend only
pnpm dev:frontend         # Start frontend only

# Database
pnpm db:migrate           # Run database migrations
pnpm db:seed              # Seed initial data
pnpm db:reset             # Reset database

# Docker
pnpm docker:dev           # Start development infrastructure
pnpm docker:prod          # Start production stack
pnpm docker:down          # Stop all containers

# Code quality
pnpm lint                 # Lint all packages
pnpm typecheck            # Type check all packages
pnpm format               # Format code with Prettier
pnpm test                 # Run all tests
```

## 🎯 Face Recognition Setup

### CompreFace Configuration

1. Access CompreFace Admin at http://localhost:8080
2. Create a new application
3. Add a recognition service
4. Copy the API key to your `.env` file:

```env
COMPREFACE_API_KEY=your_api_key_here
```

### Adding Face Models

Upload face images through:
- CompreFace UI at http://localhost:8082
- ITAP Dashboard (when implemented)
- Direct API calls to CompreFace

## 🔐 Environment Variables

Key environment variables for configuration:

```env
# Database
DATABASE_URL=postgresql://itap_user:itap_password@localhost:5432/itap_dev

# Redis
REDIS_URL=redis://:redis_password@localhost:6379

# CompreFace
COMPREFACE_API_URL=http://localhost:8081
COMPREFACE_API_KEY=your_api_key_here

# Security
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here

# File Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

## 🚢 Production Deployment

### Using Docker Compose

```bash
# Set production environment variables
export POSTGRES_PASSWORD=secure_password
export REDIS_PASSWORD=secure_password
export JWT_SECRET=your_secure_jwt_secret

# Start production stack
pnpm docker:prod
```

### Manual Deployment

1. Build all packages: `pnpm build`
2. Set up PostgreSQL and Redis
3. Configure environment variables
4. Start services with `pnpm start`

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run end-to-end tests
pnpm test:e2e
```

## 📚 API Documentation

### Authentication

```bash
# Login
POST /api/auth/login
{
  "email": "admin@itap.com",
  "password": "admin123"
}

# Get current user
GET /api/auth/me
Authorization: Bearer <token>
```

### Identities

```bash
# List identities
GET /api/identities

# Create identity
POST /api/identities
{
  "embeddings": [[...]], 
  "attributes": {"age": 30, "gender": "male"}
}

# Get identity
GET /api/identities/:id
```

### Real-time Events

Connect to WebSocket at `ws://localhost:3001`:

```javascript
const socket = io('http://localhost:3001')

// Join facility for real-time updates
socket.emit('join-facility', 'facility-id')

// Listen for identity detections
socket.on('identity_detected', (data) => {
  console.log('Identity detected:', data)
})
```

## 🔍 Troubleshooting

### Common Issues

**CompreFace not starting**:
- Increase Docker memory allocation (8GB+ recommended)
- Wait longer for initialization (2-3 minutes)
- Check logs: `docker logs itap-compreface-api`

**Database connection errors**:
- Ensure PostgreSQL container is running
- Check DATABASE_URL in .env
- Run migrations: `pnpm db:migrate`

**Frontend not connecting to backend**:
- Verify backend is running on port 3001
- Check CORS configuration
- Confirm .env variables are loaded

### Logs and Debugging

```bash
# View service logs
docker logs itap-postgres-dev
docker logs itap-redis-dev
docker logs itap-compreface-api

# Backend debugging
DEBUG=* pnpm dev:backend

# Database inspection
docker exec -it itap-postgres-dev psql -U itap_user -d itap_dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and linting: `pnpm test && pnpm lint`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [CompreFace Documentation](https://github.com/exadel-inc/CompreFace)
- [React Documentation](https://react.dev)
- [TypeORM Documentation](https://typeorm.io)
- [TailwindCSS v4 Guide](https://tailwindcss.com/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)

---

Built with ❤️ for identity tracking and access control solutions.