# ITAP - Startup Instructions

This guide provides step-by-step instructions for setting up and running the Identity Tracking and Access Platform (ITAP) development environment.

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** and **Docker Compose**
- **Git**

## Quick Start

### Option 1: Using Makefile (Recommended)

```bash
# Clone and setup the project
git clone <repository-url>
cd 3v_mono

# Start development environment
make dev

# Stop all services
make stop

# Clean and restart everything
make clean && make dev
```

### Option 2: Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure services (PostgreSQL, Redis, MinIO)
make infra
# or manually:
# docker run -d --name itap-postgres-dev --network bridge \
#   -e POSTGRES_DB=itap_dev -e POSTGRES_USER=itap_user -e POSTGRES_PASSWORD=itap_password \
#   -p 5432:5432 postgres:16-alpine

# 3. Start backend (in one terminal)
pnpm dev:backend

# 4. Start frontend (in another terminal)
pnpm dev:frontend
```

## Service URLs

Once started, the following services will be available:

- **Frontend**: http://localhost:5173/
- **Backend API**: http://localhost:3001/
- **API Health Check**: http://localhost:3001/health
- **MinIO Console**: http://localhost:9001/ (admin/minioadmin123)
- **PostgreSQL**: localhost:5432 (itap_user/itap_password)
- **Redis**: localhost:6379 (password: redis_password)

## Development Commands

### Makefile Commands

```bash
make dev          # Start full development environment
make infra        # Start only infrastructure services (DB, Redis, MinIO)
make backend      # Start only backend service
make frontend     # Start only frontend service
make stop         # Stop all services
make clean        # Remove all containers and volumes
make logs         # Show logs from all services
make db-reset     # Reset database (drop and recreate)
make help         # Show available commands
```

### Package.json Scripts

```bash
# Development
pnpm dev                # Start both backend and frontend
pnpm dev:backend        # Start backend only
pnpm dev:frontend       # Start frontend only

# Building
pnpm build             # Build all projects
pnpm build:backend     # Build backend only
pnpm build:frontend    # Build frontend only

# Testing
pnpm test              # Run all tests
pnpm test:e2e          # Run end-to-end tests
pnpm lint              # Run linting
pnpm typecheck         # Run type checking

# Database
pnpm db:migrate        # Run database migrations
pnpm db:seed           # Seed initial data
pnpm db:reset          # Reset database
```

## Project Structure

```
3v_mono/
├── apps/
│   ├── backend/           # Express API server
│   │   ├── src/
│   │   │   ├── config/    # Database, Redis configuration
│   │   │   ├── entities/  # TypeORM entities
│   │   │   ├── routes/    # API routes
│   │   │   ├── services/  # Business logic
│   │   │   └── index.ts   # Main server file
│   │   └── models/        # Face detection models
│   └── frontend/          # React dashboard
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── stores/
│       │   └── types/
├── docker/               # Docker configurations
├── docs/                 # Project documentation
└── Makefile             # Development commands
```

## Features

### Backend (Node.js + Express + TypeScript)
- **Database**: PostgreSQL with TypeORM
- **Cache**: Redis for sessions and caching
- **Real-time**: Socket.io for live updates
- **Face Recognition**: TensorFlow.js with BlazeFace model
- **API**: RESTful API with rate limiting
- **Security**: Helmet, CORS, JWT authentication

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Styling**: TailwindCSS v4 + shadcn/ui components
- **Build Tool**: Vite for fast development
- **State Management**: React Query + Zustand
- **Real-time**: Socket.io client for live updates

### Infrastructure
- **Database**: PostgreSQL 16 (Docker container)
- **Cache**: Redis 7 (Docker container)  
- **File Storage**: MinIO (S3-compatible, Docker container)

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 3001, 5173, 5432, 6379, 9000-9001 are available
2. **PostgreSQL connection failed**: 
   - Stop local PostgreSQL: `brew services stop postgresql`
   - Check if container is running: `docker ps | grep postgres`
3. **Redis authentication error**: Redis password is `redis_password`
4. **Frontend not loading**: Check if backend is running on port 3001

### Reset Everything

```bash
# Stop all services and clean up
make clean

# Start fresh
make dev
```

### Database Issues

```bash
# Reset database completely
make db-reset

# Check database connection
docker exec itap-postgres-dev psql -U itap_user -d itap_dev -c "SELECT version();"
```

### Logs and Debugging

```bash
# View all logs
make logs

# View specific service logs
docker logs itap-postgres-dev
docker logs itap-redis-dev
docker logs itap-minio-dev

# Backend logs are shown in the terminal where you ran pnpm dev:backend
# Frontend logs are shown in the terminal where you ran pnpm dev:frontend
```

## Development Workflow

1. **Start development environment**: `make dev`
2. **Make code changes**: Backend auto-reloads with nodemon, frontend auto-reloads with Vite
3. **Run tests**: `pnpm test`
4. **Check types**: `pnpm typecheck`
5. **Lint code**: `pnpm lint`
6. **Stop services**: `make stop`

## Production Deployment

For production deployment, see `docker/docker-compose.prod.yml` and use:

```bash
# Build production images
pnpm build

# Start production environment
make prod
```